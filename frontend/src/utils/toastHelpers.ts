/**
 * Toast 辅助函数
 * 
 * 提供统一的 Toast 提示功能，支持 messageCode 国际化翻译
 * 
 * @example
 * ```typescript
 * import { showSuccessToast, showErrorToast } from '@/new/utils/toastHelpers';
 * 
 * // 使用 messageCode
 * showSuccessToast(t, 'TABLE_CREATED', '表创建成功');
 * 
 * // 使用 API 响应
 * showSuccessToast(t, response.messageCode, response.message);
 * 
 * // 使用 API 错误
 * showErrorToast(t, error.code, error.message);
 * ```
 */

import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import type { ApiError } from '@/api/client';

/**
 * 显示成功 Toast
 * 
 * 优先使用 messageCode 进行 i18n 翻译，如果翻译不存在则使用 fallbackMessage
 * 
 * @param t - i18next 翻译函数
 * @param messageCode - 消息代码（用于 i18n 翻译）
 * @param fallbackMessage - 后备消息（翻译不存在时使用）
 * @param options - 额外选项
 */
export function showSuccessToast(
  t: TFunction,
  messageCode?: string,
  fallbackMessage?: string,
  options?: {
    /** 插值参数 */
    params?: Record<string, unknown>;
    /** Toast 持续时间（毫秒） */
    duration?: number;
  }
): void {
  const { params, duration } = options || {};

  let message: string;

  if (messageCode) {
    // 尝试从 errors 命名空间获取翻译
    // 使用 messageCode 作为默认值，这样如果找不到翻译会返回 messageCode 本身
    const translated = t(`errors:${messageCode}`, {
      defaultValue: messageCode,
      ...params,
    });

    // 如果翻译存在且不等于 messageCode 本身（说明找到了翻译），使用翻译
    if (translated && translated !== messageCode) {
      message = translated;
    } else {
      // 翻译不存在，使用后备消息
      message = fallbackMessage || messageCode;
    }
  } else {
    message = fallbackMessage || t('common:success', '操作成功');
  }

  toast.success(message, { duration });
}

/**
 * 显示错误 Toast
 * 
 * 优先使用 error.code/messageCode 进行 i18n 翻译，如果翻译不存在则使用 error.message
 * 
 * @param t - i18next 翻译函数
 * @param errorOrCode - ApiError 对象或错误代码字符串
 * @param fallbackMessage - 后备消息（翻译不存在时使用）
 * @param options - 额外选项
 */
export function showErrorToast(
  t: TFunction,
  errorOrCode?: ApiError | Error | string,
  fallbackMessage?: string,
  options?: {
    /** 插值参数 */
    params?: Record<string, unknown>;
    /** Toast 持续时间（毫秒） */
    duration?: number;
  }
): void {
  const { params, duration } = options || {};

  let code: string | undefined;
  let errorMessage: string | undefined;

  if (typeof errorOrCode === 'string') {
    code = errorOrCode;
  } else if (errorOrCode) {
    const apiError = errorOrCode as ApiError;
    code = apiError.code || apiError.messageCode;
    errorMessage = apiError.message;
  }

  let message: string;

  if (code) {
    // 尝试从 errors 命名空间获取翻译
    // 使用 code 作为默认值，这样如果找不到翻译会返回 code 本身
    const translated = t(`errors:${code}`, {
      defaultValue: code,
      ...params,
    });

    // 如果翻译存在且不等于 code 本身（说明找到了翻译），使用翻译
    // 否则优先使用 errorMessage 或 fallbackMessage
    if (translated && translated !== code) {
      message = translated;
    } else {
      // 翻译不存在，使用错误消息或后备消息
      message = errorMessage || fallbackMessage || code;
    }
  } else {
    message = errorMessage || fallbackMessage || t('common:error', '操作失败');
  }

  toast.error(message, { duration });
}

/**
 * 显示 API 响应 Toast
 * 
 * 根据响应的 success 字段自动选择成功或错误 Toast
 * 
 * @param t - i18next 翻译函数
 * @param response - API 响应对象
 * @param options - 额外选项
 */
export function showResponseToast(
  t: TFunction,
  response: {
    success?: boolean;
    messageCode?: string;
    message?: string;
    error?: {
      code?: string;
      message?: string;
    };
  },
  options?: {
    /** 成功时的后备消息 */
    successFallback?: string;
    /** 失败时的后备消息 */
    errorFallback?: string;
    /** 插值参数 */
    params?: Record<string, unknown>;
    /** Toast 持续时间（毫秒） */
    duration?: number;
  }
): void {
  const { successFallback, errorFallback, params, duration } = options || {};

  if (response.success) {
    showSuccessToast(t, response.messageCode, response.message || successFallback, {
      params,
      duration,
    });
  } else {
    const errorCode = response.error?.code || response.messageCode;
    const errorMessage = response.error?.message || response.message;
    showErrorToast(t, errorCode, errorMessage || errorFallback, {
      params,
      duration,
    });
  }
}

/**
 * 处理 API 错误并显示 Toast
 * 
 * 用于 catch 块中统一处理错误
 * 
 * @param t - i18next 翻译函数
 * @param error - 错误对象
 * @param fallbackMessage - 后备消息
 * @param options - 额外选项
 * 
 * @example
 * ```typescript
 * try {
 *   await deleteTable(tableName);
 *   showSuccessToast(t, 'TABLE_DELETED');
 * } catch (error) {
 *   handleApiErrorToast(t, error, '删除表失败');
 * }
 * ```
 */
export function handleApiErrorToast(
  t: TFunction,
  error: unknown,
  fallbackMessage?: string,
  options?: {
    /** 插值参数 */
    params?: Record<string, unknown>;
    /** Toast 持续时间（毫秒） */
    duration?: number;
  }
): void {
  if (error instanceof Error) {
    showErrorToast(t, error as ApiError, fallbackMessage, options);
  } else if (typeof error === 'string') {
    showErrorToast(t, error, fallbackMessage, options);
  } else {
    showErrorToast(t, undefined, fallbackMessage || t('common:error', '操作失败'), options);
  }
}

/**
 * 获取 messageCode 的翻译文本
 * 
 * 用于需要获取翻译文本但不显示 Toast 的场景
 * 
 * @param t - i18next 翻译函数
 * @param messageCode - 消息代码
 * @param fallback - 后备文本
 * @returns 翻译后的文本
 */
export function getMessageText(
  t: TFunction,
  messageCode?: string,
  fallback?: string
): string {
  if (!messageCode) {
    return fallback || '';
  }

  const translated = t(`errors:${messageCode}`, { defaultValue: '' });

  if (translated && translated !== messageCode) {
    return translated;
  }

  return fallback || messageCode;
}

/**
 * 清理错误消息
 * 
 * 移除常见的错误前缀，如 "Error: ", "Exception: " 等
 * 
 * @param message - 原始错误消息
 * @returns 清理后的错误消息
 */
export function cleanErrorMessage(message: string): string {
  if (!message) return '';
  return message
    .replace(/^Error:\s*/i, '')
    .replace(/^Exception:\s*/i, '')
    .trim();
}
