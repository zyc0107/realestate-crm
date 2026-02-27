const BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export function getToken() {
  return localStorage.getItem('crm_token');
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    window.location.reload();
    return;
  }
  return res;
}
