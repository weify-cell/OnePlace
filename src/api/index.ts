import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

// Add auth token to all requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('oneplace_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 responses
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('oneplace_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)
