/** Keep keys in sync with any legacy localStorage usage. */
export const AUTH_TOKEN_KEY = "medscribe_token";
export const AUTH_USER_KEY = "medscribe_user";
export const SELECTED_CLINIC_KEY = "medscribe_selected_clinic";

export function clearAuthStorage(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(SELECTED_CLINIC_KEY);
}
