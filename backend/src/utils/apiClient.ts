import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
  proxy?: string;
}

export class ApiClient {
  private baseURL: string;
  private timeout: number;
  private defaultHeaders: Record<string, string>;
  private proxy?: string;

  constructor(config: ApiClientConfig) {
    this.baseURL = config.baseURL;
    this.timeout = config.timeout || 30000;
    this.defaultHeaders = config.headers || {};
    this.proxy = config.proxy || process.env.HTTPS_PROXY || process.env.https_proxy;
  }

  private createConfig(config?: AxiosRequestConfig): AxiosRequestConfig {
    const axiosConfig: AxiosRequestConfig = {
      ...config,
      timeout: this.timeout,
      headers: {
        ...this.defaultHeaders,
        ...config?.headers,
      },
    };

    if (this.proxy) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(this.proxy);
      axiosConfig.proxy = false;
    }

    return axiosConfig;
  }

  async get<T>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const response: AxiosResponse<T> = await axios.get(url, this.createConfig(config));
    return response.data;
  }

  async post<T>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const response: AxiosResponse<T> = await axios.post(url, data, this.createConfig(config));
    return response.data;
  }
}

export const createPredictClient = (apiKey: string) => {
  return new ApiClient({
    baseURL: 'https://api.predict.fun/v1',
    headers: {
      'x-api-key': apiKey,
    },
  });
};

export const createPolymarketClient = () => {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;

  return new ApiClient({
    baseURL: 'https://gamma-api.polymarket.com',
    proxy,
  });
};

export const createPolymarketClobClient = () => {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;

  return new ApiClient({
    baseURL: 'https://clob.polymarket.com',
    proxy,
  });
};
