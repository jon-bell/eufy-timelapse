import "dotenv/config";
import { Camera, EufySecurity, EufySecurityConfig, PropertyValue } from "eufy-security-client";
import { exec } from "@actions/exec";
import fs from "fs/promises";
import _fs from "fs";
import { getAverageColor } from "fast-average-color-node";
import express, { Express, RequestHandler } from "express";
import * as http from "http";
import serveIndex from "serve-index";
import { AddressInfo } from "net";
import thumbnail from "image-thumbnail";
import CORS from "cors";
import { nanoid } from "nanoid";

const IMG_DIR = process.env.DATA_DIR + "images/" || "images/";
class EufyFrameGrabber {
  private client: EufySecurity;
  private device?: Camera;
  private app;
  private captchaRequest?: string;
  private captchaID?: string;
  private captchaSolution?: string;
  private frames: string[] = [];
  private sessions: string[] = [];
  private siteName?: string;
  private batteryValue?: PropertyValue;
  

  constructor() {
    this.app = express();
    this.configureExpress();

    const config: EufySecurityConfig = {
      username: process.env.EUFY_USERNAME || "",
      password: process.env.EUFY_PASSWORD || "",
      p2pConnectionSetup: 0,
      eventDurationSeconds: 30,
      persistentDir: process.env.DATA_DIR || "./",
      pollingIntervalMinutes: 10,
    };
    const ignore = (_args: any) => {};
    this.client = new EufySecurity(config, {
      debug: ignore,
      trace: ignore,
      info: ignore,
      error: console.error,
      warn: console.error,
    });
    this.client.on("captcha request", (id: string, captcha: string) => {
      this.onCaptchaRequest(id, captcha);
    });
    this.frames = _fs
      .readdirSync(IMG_DIR)
      .filter((file) => file.endsWith(".jpg") && !file.includes("thumb"));
    //Check that all frames have thumbnails
    this.frames.forEach(async (img) => {
      try {
        await fs.access(`${IMG_DIR}/thumb_${img}`);
      } catch (err) {
        await EufyFrameGrabber.createThumb(img);
      }
    });

    setInterval(
      () => this.connectAndRun,
      parseInt(process.env.FRAME_GRAB_INTERVAL_MIN || "10") * 60 * 1000
    );
  }
  private static async createThumb(img: string) {
    const thumb = await thumbnail(`${IMG_DIR}/${img}`, {
      height: 100,
      width: 240,
      responseType: "buffer",
    });
    await fs.writeFile(`${IMG_DIR}/thumb_${img}`, thumb);
  }

  private configureExpress() {
    this.app.use(CORS({origin: "*"}));
    const checkLogin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if(req.path == "/login")
        return next();
      const token = req.headers.authorization;
      const tokenParam = req.query.downloadToken as string;
      if ((!token || !this.sessions.includes(token))
      && (!tokenParam || !this.sessions.includes(tokenParam)))
      {
        return res.status(403).send();
      }
      return next();
    };

    this.app.post("/login", express.json(), (req, res) => {
      const { username, password } = req.body;
      const usernames = Object.keys(process.env).filter((key) =>
        key.startsWith("AUTHORIZED_USERNAME_")
      );
      const matchingUserID = usernames
        .find((authorizedName) => process.env[authorizedName] === username)
        ?.replace("AUTHORIZED_USERNAME_", "");
      if (
        matchingUserID &&
        process.env[`AUTHORIZED_PASSWORD_${matchingUserID}`] === password
      ) {
        const newToken = nanoid(140);
        this.sessions.push(newToken);
        res.status(200).send(newToken);
        return;
      } else {
        res.status(403).send();
        return;
      }
    });
    this.app.use(checkLogin);
    this.app.post("/logout", (req, res) => {
      const token = req.headers.authorization;
      this.sessions = this.sessions.filter(session => session !== token);
      res.status(200).send();
    });
    this.app.get("/images", (_req, res) => {
      const token = nanoid(32);
      setTimeout(()=>{
        this.sessions = this.sessions.filter(session => session !== token);
      }, 1000*60*60*6);
      this.sessions.push(token);
      res.json({ images: this.frames, downloadToken: token });
    });
    this.app.get("/imageToken", (_req, res)=>{
      const token = nanoid(32);
      setTimeout(()=>{
        this.sessions = this.sessions.filter(session => session !== token);
      }, 1000*60*60*6);
      this.sessions.push(token);
      res.json({ downloadToken: token });
    });
    this.app.get("/status", (_req, res) => {
      res.json({
        isConnected: this.client.isConnected(),
        captchaRequested: this.captchaRequest,
        siteName: this.siteName,
        batteryValue: this.batteryValue
      });
    });
    this.app.get("/video/:token/:fps?", async (req, res) => {
      const fps = parseInt(req.params.fps || "2");
      const videoPath = await this.generateVideo(fps);
      const { size } = await fs.stat(videoPath);
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Length": size,
      });
      let frstream = _fs.createReadStream(videoPath);
      frstream.on("end", () => {
        fs.unlink(videoPath);
      });
      frstream.pipe(res);
    });
    this.app.get("/captcha/:solution", async (req, res) => {
      const captchaSolution = decodeURIComponent(req.params.solution);
      this.captchaSolution = captchaSolution;
      await this.connectAndRun();
      res.json({
        isConnected: this.client.isConnected(),
        captchaRequested: this.captchaRequest,
      });
    });

    this.app.use(express.static(IMG_DIR));
    this.app.use(serveIndex(IMG_DIR));

    const server = http.createServer(this.app);
    server.listen(process.env.PORT || "8080", () => {
      const address = server.address() as AddressInfo;
      console.log(`Listening on ${address.port}`);
    });
  }

  private async generateVideo(fps: number = 1): Promise<string> {
    const outputName = `timelapse_${Date.now()}.mp4`;
    await exec(
      "ffmpeg",
      [
        "-framerate",
        `${fps}`,
        "-pattern_type",
        "glob",
        "-i",
        `${IMG_DIR}16*.jpg`,
        "-vcodec",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        outputName,
      ],
      { cwd: process.env.DATA_DIR }
    );
    return outputName;
  }
  private onCaptchaRequest(id: string, captcha: string) {
    console.log(`captcha requeted`);
    this.captchaID = id;
    this.captchaRequest = captcha;
  }

  public async connect() {
    let connection;
    this.captchaRequest = undefined;
    if (this.captchaSolution) {
      const captchaSolution = this.captchaSolution;
      const captchaID = this.captchaID;
      this.captchaSolution = undefined;
      this.captchaID = undefined;
      console.log(`passing captcha solution ${captchaSolution}`);
      connection = await this.client.connect(captchaSolution, captchaID);
    } else {
      connection = await this.client.connect();
    }
    console.log(`Connect result: ${connection}`);
    if (!connection) throw new Error("Unable to connect to Eufy Service");
    await this.client.refreshCloudData();
  }
  public async connectAndRun() {
    try {
      await this.connect();
      const stationSN = process.env.EUFY_STATION_SN;

      if (!stationSN)
        throw new Error(
          "No station serial number specified; retrieve from app by going to the device, then settings, then about device, then copy the Serial Number."
        );

      this.device = this.client.getDevice(stationSN) as Camera;
      console.log(this.device.getProperties());
      this.batteryValue = this.device.getBatteryValue();
      this.siteName = this.device.getName();
      await this.grabFrame();
      this.client.close();
    } catch (err) {
      console.trace(err);
    }
  }
  private async fetchFrameWithRetry(url: string, retriesRemaining = 10) {
    console.log(this.device?.isStreaming());
    const newImgName = `${new Date().getTime()}.jpg`;
    const newImgPath = `${IMG_DIR}/${newImgName}`;
    if (!retriesRemaining) {
      throw new Error("Maximum retries failed, ignoring this frame grab");
    }
    const deleteImg = () => {
      return fs.unlink(newImgPath).catch((_err) => {});
    };

    try {
      await Promise.race([
        exec("ffmpeg", ["-y", "-i", url, "-vframes", "1", newImgPath]),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(), 1000 * 30)
        ),
      ]); //30 second timeout to try again
      if (!(await this.isValidFrame(newImgPath))) {
        await deleteImg();
        await this.fetchFrameWithRetry(url, retriesRemaining - 1);
      } else {
        await EufyFrameGrabber.createThumb(newImgName);
        this.frames.push(newImgName);
        console.log(`success writing ${newImgName}`);
      }
    } catch (err) {
      await deleteImg();
      await this.fetchFrameWithRetry(url, retriesRemaining - 1);
    }
  }
  public async isValidFrame(path: string) {
    try {
      const color = await getAverageColor(path);
      console.log("Color received:");
      console.log(color);
      if (color.value.every((v) => v > 250)) return false;
      return true;
    } catch (err) {
      return false;
    }
  }
  private async grabFrame() {
    console.log("Looking for frame");
    if (this.device) {
      console.log("Pre-start status: " + this.device.isStreaming());
      const url = await this.device.startStream();
      await this.fetchFrameWithRetry(url);
      await this.device.stopStream();
      console.log("Post-stop status: " + this.device.isStreaming());
    }
  }
}

const frameGrabber = new EufyFrameGrabber();
frameGrabber.connectAndRun();
