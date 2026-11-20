import 'axios';

declare module 'axios' {
  export interface AxiosResponse<T = any, D = any> {
    success?: boolean;
    pagination?: {
      current: number;
      pageSize: number;
      total: number;
    };
    data: T;
  }
}
