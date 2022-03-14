import axios, { AxiosInstance, AxiosResponse } from "axios";

type PropertyValue ={
  value: string;
  timestamp: number;
}
export type StatusResponse = {
  isConnected: boolean;
  captchaRequested?: string;
  siteName: string;
  batteryValue: PropertyValue;
};

export type ImageFrame = {
  url: string;
  thumbnailUrl: string;
  name: string;
  timestamp: number;
};
export type ImagesResp = {
  images: ImageFrame[];
  downloadToken: string;
};
export default class ServiceClient {
  private axios: AxiosInstance;
  constructor(token?: string) {
    if (token) {
      this.axios = axios.create({
        baseURL: process.env.REACT_APP_SERVICE_URL,
        headers: {
          Authorization: token,
        },
      });
    } else {
      this.axios = axios.create({
        baseURL: process.env.REACT_APP_SERVICE_URL,
      });
    }
  }
  async getImages(): Promise<ImagesResp> {
    const resp = await this.axios.get("/images");
    const _images = resp.data.images as string[];
    const images = _images.map((str) => ({
      url: `${process.env.REACT_APP_SERVICE_URL}/${str}`,
      thumbnailUrl: `${process.env.REACT_APP_SERVICE_URL}/thumb_${str}`,
      name: str,
      timestamp: parseInt(str.replace(".jpg",""))
    }));
    return { images, downloadToken: resp.data.downloadToken };
  }
  async getStatus(): Promise<StatusResponse> {
    const resp = await this.axios.get("/status");
    return resp.data;
  }
  async login(username: string, password: string): Promise<string> {
    const resp = await this.axios.post("/login", {
      username: username,
      password: password,
    });
    return resp.data;
  }
  async sendCaptcha(solution: string): Promise<StatusResponse> {
    const resp = await this.axios.get(
      `/captcha/${encodeURIComponent(solution)}`
    );
    return resp.data;
  }
  set token(token: string) {
    this.axios = axios.create({
      baseURL: process.env.REACT_APP_SERVICE_URL,
      headers: {
        Authorization: token,
      },
    });
  }
  async refreshDownloadToken(): Promise<string> {
    const resp = await this.axios.get("/imageToken");
    return resp.data.downloadToken;
  }
  async logOut() {
    await this.axios.post("/logout");
    this.axios = axios.create({
      baseURL: process.env.REACT_APP_SERVICE_URL,
    });
  }
}
