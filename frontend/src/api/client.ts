import { sdk } from '@farcaster/miniapp-sdk';

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:3001" : "");

let farcasterFid: number | null = null;
let farcasterUsername: string | null = null;
let farcasterPfp: string | null = null;

type IdentityInput = {
  fid: number | null;
  username?: string | null;
  pfp?: string | null;
};

export function setFarcasterIdentity({ fid, username, pfp }: IdentityInput) {
  if (typeof fid === 'number' && Number.isFinite(fid)) {
    farcasterFid = Math.trunc(fid);
  } else {
    farcasterFid = null;
  }

  farcasterUsername = typeof username === 'string' && username.trim().length > 0 ? username.trim() : null;
  farcasterPfp = typeof pfp === 'string' && pfp.trim().length > 0 ? pfp.trim() : null;
}

export function withIdentityHeaders(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers ?? undefined);
  
  if (farcasterFid != null) {
    headers.set('x-farcaster-fid', String(farcasterFid));
  }
  if (farcasterUsername) {
    // Encode to handle non-ASCII characters (emojis, etc.)
    headers.set('x-farcaster-username', encodeURIComponent(farcasterUsername));
  }
  if (farcasterPfp) {
    // Encode to handle special characters in URLs
    headers.set('x-farcaster-pfp', encodeURIComponent(farcasterPfp));
  }
  
  return { ...init, headers };
}

export async function withAuthHeaders(init: RequestInit = {}): Promise<RequestInit> {
  const headers = new Headers(init.headers ?? undefined);
  const { token } = await sdk.quickAuth.getToken();
  headers.set('Authorization', `Bearer ${token}`);
  
  return { ...init, headers };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  
  // Add timeout to prevent hanging requests
  const timeoutMs = 15000; // 15 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { 
      mode: 'cors',
      signal: controller.signal,
      ...withIdentityHeaders(init),
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // Try to extract error message from response body
      let errorMessage = `API ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData && typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        } else if (errorData && typeof errorData.message === 'string') {
          errorMessage = errorData.message;
        }
      } catch {
        // If parsing JSON fails, use status text
        errorMessage = response.statusText || `API ${response.status}`;
      }
      throw new Error(errorMessage);
    }
    return (await response.json()) as T;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

export async function apiFetchWithAuth<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, await withAuthHeaders(init));
}

export { API_BASE };
