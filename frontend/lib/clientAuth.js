export const CLIENT_TOKEN_STORAGE_KEY = "dlgtw_client_token";
export const CLIENT_ACCOUNT_PATH = "/account/dashboard";
const CHECKOUT_ACCOUNT_TOKEN_STORAGE_KEY = "dlgtw_checkout_account_token";


export function getClientToken() {
    return localStorage.getItem(CLIENT_TOKEN_STORAGE_KEY) || "";
}


export function clearClientToken() {
    localStorage.removeItem(CLIENT_TOKEN_STORAGE_KEY);
}


export function clearClientOnboardingToken() {
    localStorage.removeItem(CHECKOUT_ACCOUNT_TOKEN_STORAGE_KEY);
}


export function getClientAuthConfig() {
    const legacyToken = getClientToken();

    return {
        withCredentials: true,
        ...(legacyToken
            ? {
                headers: {
                    Authorization: `Bearer ${legacyToken}`,
                },
            }
            : {}),
    };
}
