import React, { useEffect, useRef, useState } from "react";
import logo from "./logo.svg";
import "./App.css";
import ImageGallery, { ReactImageGalleryItem } from "react-image-gallery";
import ServiceClient, { ImageFrame, StatusResponse } from "./ServiceClient";
import {
  Box,
  Button,
  Center,
  ChakraProvider,
  Checkbox,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  toast,
  useToast,
} from "@chakra-ui/react";
import moment from "moment-timezone";
import { stat } from "fs";

function Login() {
  const [token, setToken] = useState<string>(
    localStorage.getItem("token") || ""
  );
  const [serviceClient] = useState<ServiceClient>(new ServiceClient(token));

  return (
    <ChakraProvider>
      <div className="App">
        <Flex alignItems={"center"}>
          {token ? (
            <Stack>
              <App
                logout={async () => {
                  serviceClient.logOut().catch(()=>{});
                  setToken("");
                  localStorage.clear();
                }}
                serviceClient={serviceClient}
              />
            </Stack>
          ) : (
            <LoginForm setToken={setToken} serviceClient={serviceClient} />
          )}
        </Flex>
      </div>
    </ChakraProvider>
  );
}
function LoginForm({
  setToken,
  serviceClient,
}: {
  setToken: (str: string) => void;
  serviceClient: ServiceClient;
}) {
  const [username, setUsername] = useState<string>();
  const [password, setPassword] = useState<string>();
  const [saveToken, setSaveToken] = useState<boolean>(true);
  const toast = useToast();
  const submitForm = async () => {
    if (username && password) {
      try {
        const token = await serviceClient.login(username, password);
        if (saveToken) {
          localStorage.setItem("token", token);
        }
        serviceClient.token = token;
        setToken(token);
      } catch (err) {
        toast({ title: "Invalid username or password", status: "error" });
      }
    } else {
      toast({
        title: "Please specify a username and password",
        status: "error",
      });
    }
  };
  return (
    <Box p={4}>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          submitForm();
        }}
      >
        <FormControl>
          <FormLabel htmlFor="username">Username</FormLabel>
          <Input
            id="username"
            name="username"
            value={username}
            type="text"
            onChange={(e) => setUsername(e.target.value)}
          />
        </FormControl>
        <FormControl>
          <FormLabel htmlFor="password">Password</FormLabel>
          <Input
            id="password"
            name="password"
            value={password}
            type="password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormControl>
        <FormControl>
          <Checkbox
            defaultChecked
            onChange={(ev) => {
              setSaveToken(ev.target.checked);
            }}
          >
            Remember Me
          </Checkbox>
        </FormControl>
        <Button type="submit">Submit</Button>
      </form>
    </Box>
  );
}
function App({
  logout,
  serviceClient,
}: {
  logout: () => void;
  serviceClient: ServiceClient;
}) {
  const [status, setStatus] = useState<StatusResponse>();
  const [images, setImages] = useState<ReactImageGalleryItem[]>([]);
  const [speed, setSpeed] = useState<number>(parseInt(window.localStorage.getItem('speed') || '100'));
  const [downloadToken, setDownloadToken] = useState<string>();
  const galleryRef = useRef<ImageGallery>(null);

  const toast = useToast();
  const captchaInputRef = useRef(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const resp = await serviceClient.getStatus();
        console.log(resp);
        setStatus(resp);
      } catch (err) {
        toast({ title: "Error: Please re-login", status: "error" });
        logout();
      }
    };
    fetchStatus();
  }, [serviceClient, setStatus, logout, toast]);

  useEffect(() => {
    const fetchImages = async () => {
      const resp = await serviceClient.getImages();
      setDownloadToken(resp.downloadToken);
      setImages(
        resp.images.map((item) => ({
          original: item.url + "?downloadToken=" + resp.downloadToken,
          originalWidth:1920,
          originalHeight: 1080,
          thumbnail: item.thumbnailUrl + "?downloadToken=" + resp.downloadToken,
          originalTitle: item.name,
          thumbnailTitle: ""+item.timestamp
        }))
      );
      const gallery = galleryRef.current;
      if(gallery){
        const nDaysAgo = moment().subtract(24, 'hours').toDate().getTime();
        const idx = resp.images.findIndex((val) => val.timestamp >= nDaysAgo);
        gallery.slideToIndex(idx);
      }
    };
    fetchImages();
    const refreshTokenTask = setInterval(async () => {
      setDownloadToken(await serviceClient.refreshDownloadToken());
    }, 1000 * 60 * 60 * 5);
    return () => {
      clearInterval(refreshTokenTask);
    };
  }, [serviceClient, setDownloadToken, setImages, galleryRef]);

  const captchaForm = status?.captchaRequested ? (
    <form
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (captchaInputRef.current) {
          const input = captchaInputRef.current as HTMLInputElement;
          if (input.value) {
            const newStatus = await serviceClient.sendCaptcha(input.value);
            await setStatus(newStatus);
          }
        }
      }}
    >
      <b>Please complete this captcha challenge:</b>
      <img src={status.captchaRequested} alt="captcha" />
      <input name="captcha" type="text" ref={captchaInputRef} />
      <input type="submit" />
    </form>
  ) : (
    <></>
  );
  const speeds = [
    { value: 1000, label: "Slow" },
    { value: 500, label: "Medium" },
    { value: 250, label: "Fast" },
    { value: 100, label: "Very fast" },
  ];
  return (
    <Stack>
      <Box>
        <Flex direction={"row"}>
          {captchaForm}
          <Box padding={"4"} flexGrow={"100"}>
            <Flex>
              <Box padding="4">
                <Heading as={'h2'}>{status?.siteName}</Heading>
                Battery: {status?.batteryValue.value}%
                </Box>
              <Box flexGrow={"100"}></Box>
              <Box padding="4">
                <form>
                  Speed:{" "}
                  <select
                    onChange={(ev) => {
                      window.localStorage.setItem('speed', ev.target.value);
                      setSpeed(parseInt(ev.target.value));
                    }}
                  >
                    {speeds.map((eachSpeed) => (
                      <option
                        value={eachSpeed.value}
                        key={eachSpeed.value}
                        selected={eachSpeed.value === speed}
                      >
                        {eachSpeed.label}
                      </option>
                    ))}
                  </select>
                </form>
              </Box>
              <Box>
                <a
                  href={`${process.env.REACT_APP_SERVICE_URL}/video/${1000 / speed}?downloadToken=${downloadToken}`}
                >
                  <Button>Generate Video</Button>
                </a>
              </Box>
            </Flex>
          </Box>
          <Box padding={"4"}>
            <Button color="red" onClick={logout}>
              Logout
            </Button>
          </Box>
        </Flex>
      </Box>
      <ImageGallery
        items={images}
        autoPlay={true}
        slideDuration={0}
        slideInterval={speed}
        ref={galleryRef}
        useTranslate3D={false}
        thumbnailPosition={"right"}
        showBullets={false}
      />
    </Stack>
  );
}

export default Login;
