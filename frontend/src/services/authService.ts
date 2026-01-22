import api from './api';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role: string;
  organizationId?: string;
  campusId?: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    token: string;
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      organizationId?: string;
      campusId?: string;
      organization?: any;
      campus?: any;
    };
  };
  message?: string;
}

export const authService = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    return api.post('/auth/login', data);
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    return api.post('/auth/register', data);
  },

  getMe: async () => {
    return api.get('/auth/me');
  },
};

