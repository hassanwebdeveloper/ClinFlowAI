export const AUTH_TOKEN_KEY = "clinflowai_auth_token";
export const AUTH_USER_KEY = "clinflowai_auth_user";
export const SELECTED_CLINIC_KEY = "clinflowai_selected_clinic_id";

export function clearAuthStorage() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(SELECTED_CLINIC_KEY);
}

