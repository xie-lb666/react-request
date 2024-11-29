import { AxiosRequestConfig } from "axios";
import axios, { AxiosInstance } from "axios";
import { refreshToken } from "@/api/interface/auth";
import { TokenManager } from "../../utils/tokenUtil";
import { DefaultErrorHandler, ErrorHandler } from "../../types/errorHandler";

const BASE_URL = "baseURL"; // 实际的baseURL

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

const axiosInstance: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 3000,
});

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
export function setErrorHandler(handler: ErrorHandler): void {
  errorHandler = handler;
}

// 请求拦截器
axiosInstance.interceptors.request.use(
  (config) => {
    /**
     * 可以在这处理 请求前的逻辑：
     */
    return config;
  },
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

    // 如果未处理刷新 token 的请求，且是 401 状态
    if (status === 401 && !config.url.includes("/token/refresh")) {
      if (!refreshing) {
        refreshing = true;
        try {
          const newToken = await refreshToken({
            refreshToken: TokenManager.getToken()?.refresh ?? "",
          });
          if (newToken.data) {
            queue.forEach(({ config, resolve }) => {
              resolve(
                axiosInstance({
                  ...config,
                  headers: {
                    ...config.headers,
                    Authorization: `Bearer ${newToken.data?.access}`,
                  },
                })
              );
            });
            queue.length = 0; // 清空队列
            return axiosInstance({
              ...config,
              headers: {
                ...config.headers,
                Authorization: `Bearer ${newToken}`,
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
  const {
    url,
    pathVariables,
    params,
    data,
    ignoreAuth,
    silentError,
    throwError,
    ...rest
  } = args;

  // 替换路径变量
  const parsedUrl = Object.keys(pathVariables || {}).reduce(
    (currentUrl, key) =>
      currentUrl.replace(
        `:${key}`,
        String((pathVariables as Record<string, string | number>)[key])
      ),
    url
  );

  const config: AxiosRequestConfig<D> = {
    url: parsedUrl,
    params,
    data,
    ...rest,
    headers: {
      ...rest.headers,
    },
  };

  // 请求前检查是否需要添加 token
  if (!ignoreAuth) {
    const token = TokenManager.getToken();
    if (token) {
      config.headers!.Authorization = `Bearer ${token.access}`;
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
