import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

client.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code !== 0) return Promise.reject(new Error(body.message || '请求失败'));
      return body.data;
    }
    return body;
  },
  (err) => Promise.reject(new Error(err.response?.data?.message || err.message)),
);

export default client;
