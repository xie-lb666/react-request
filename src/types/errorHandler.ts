/**
 * 错误处理行为接口
 */
export interface ErrorHandler {
  /**
   * 处理错误的行为方法
   * @param errorMessage 错误消息
   * @param options 可选参数，例如错误类型、持续时间等
   */
  handleError(errorMessage: string, options?: HandleErrorOptions): void;
}

/**
 * 错误处理选项
 */
export interface HandleErrorOptions {
  /**
   * 错误类型，例如 `warning`、`error`、`info`
   */
  type?: "info" | "warning" | "error";

  /**
   * 提示持续时间（毫秒）
   */
  duration?: number;
}

export class DefaultErrorHandler implements ErrorHandler {
  handleError(errorMessage: string, options?: HandleErrorOptions): void {
    const { type = "error", duration = 5000 } = options || {};

    if (type === "info") {
      console.info(`[Info]: ${errorMessage}`);
    } else if (type === "warning") {
      console.warn(`[Warning]: ${errorMessage}`);
    } else {
      console.error(`[Error]: ${errorMessage}`);
      window.alert(errorMessage);
    }
  }
}
