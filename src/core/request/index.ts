import { AxiosRequestConfig } from "axios";
import axios, { AxiosInstance } from "axios";
import { refreshToken } from "@/api/interface/auth";
import { TokenManager } from "../../utils/tokenUtil";
import { DefaultErrorHandler, ErrorHandler } from "../../types/errorHandler";

export const BASE_URL = "baseURL"; // 实际的baseURL

export type Response<T> =
  | {
      data: T;
      success: true;
      errorCode?: string;
      errorMessage?: string;
    }
  | {
      data?: T;
      success: false;
      errorCode: number;
      errorMessage: string;
    };

type ExtractKeys<T extends string> =
  T extends `${string}{${infer Key}}${infer Rest}`
    ? Key | ExtractKeys<Rest>
    : never;

type PathVariables<T extends string> = ExtractKeys<T> extends never
  ? Record<string, string | number>
  : Record<ExtractKeys<T>, string | number>;

type RequestConfig<
  D extends object,
  Q extends object,
  U extends string,
  P = PathVariables<U>
> = Omit<AxiosRequestConfig<D>, "url" | "params"> & {
  url: U;
  ignoreAuth?: boolean;
  silentError?: boolean;
  throwError?: boolean;
  params?: Q;
  pathVariables?: P;
};

export interface Request {
  <
    T,
    D extends object = any,
    Q extends object = any,
    U extends string = string,
    P = PathVariables<U>
  >(
    args: RequestConfig<D, Q, U, P>
  ): Promise<Response<T>>;
}

interface PendingTask {
  config: AxiosRequestConfig;
  resolve: Function;
}

let refreshing = false;
const queue: PendingTask[] = [];

/**
 * 设置全局错误处理行为
 * @param handler 自定义的错误处理实现
 */
let errorHandler: ErrorHandler = new DefaultErrorHandler();

const axiosInstance: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 3000,
});

// 请求拦截器 处理请求前的逻辑
axiosInstance.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

// 响应拦截器
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;
    if (!response) {
      return Promise.reject(error);
    }

    const { status } = response;

    // 如果未处理刷新 token 的请求，且是 401 状态 同时不能是 刷新token的接口
    if (
      status === 401 &&
      !config.url.includes("/token") &&
      config.method === "PUT"
    ) {
      if (!refreshing) {
        refreshing = true;
        try {
          const newToken = await refreshToken({
            refreshToken: TokenManager.getToken()?.refresh ?? "",
          });
          if (newToken.data) {
            // 保存token
            TokenManager.saveToken(newToken.data);

            queue.forEach(({ config, resolve }) => {
              // 注意 config为队列里的config
              resolve(
                axiosInstance({
                  ...config,
                  headers: {
                    ...config.headers,
                    Authorization: newToken.data?.access,
                  },
                })
              );
            });
            queue.length = 0; // 清空队列
            return axiosInstance({
              ...config,
              headers: {
                ...config.headers,
                Authorization: newToken,
              },
            });
          } else {
            // 刷新token 失败，需要重新登录
            TokenManager.clearToken();
            errorHandler.handleError("登录过期，请重新登录", {
              type: "error",
            });
          }
        } finally {
          refreshing = false;
        }
      } else {
        return new Promise((resolve) => {
          queue.push({ config, resolve });
        });
      }
    }
    return Promise.reject(error);
  }
);

const request: Request = async <
  T = any,
  D extends object = any,
  Q extends object = any,
  U extends string = string,
  P = PathVariables<U>
>(
  args: RequestConfig<D, Q, U, P>
) => {
  const { url, pathVariables, ignoreAuth, silentError, throwError, ...rest } =
    args;

  // 替换路径变量
  const parsedUrl = pathVariables
    ? Object.keys(pathVariables).reduce(
        (currentUrl, key) =>
          currentUrl.replace(
            `:${key}`,
            String((pathVariables as Record<string, string | number>)[key])
          ),
        url
      )
    : url; // 如果没有 pathVariables，直接使用原始 url

  const config: AxiosRequestConfig<D> = {
    url: parsedUrl,
    ...rest,
    headers: {
      ...rest.headers,
    },
  };

  /**
   * 请求前检查是否需要添加 token
   * 不放入到 请求拦截器中:
   *  因为根据 传入的 ignoreAuth 来进行判断
   *  并不是根据是否有token来进行判断
   */
  if (!ignoreAuth) {
    const token = TokenManager.getToken();
    if (token) {
      config.headers!.Authorization = token.access;
    } else {
      // 需要 弹出提示 或者返回到登录页
      errorHandler.handleError("没有token！！！", { type: "error" });
      return {
        success: false,
        errorCode: 401,
        errorMessage: "Unauthorized",
      } as Response<T>;
    }
  }

  try {
    const response = await axiosInstance(config);
    return { data: response.data, success: true } as Response<T>;
  } catch (error: any) {
    const { response } = error;
    const errorCode = response?.status || 500;
    const errorMessage = response?.data?.message || "请求失败";

    if (!silentError) {
      errorHandler.handleError(errorMessage, { type: "error" });
      return { success: false, errorCode, errorMessage } as Response<T>;
    }

    if (throwError) {
      throw { errorCode, errorMessage };
    }

    return { success: false, errorCode, errorMessage } as Response<T>;
  }
};

export default request;
