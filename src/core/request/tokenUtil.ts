export class TokenManager {
  private static tokenKey = "auth_token";
  private static refreshTokenKey = "refresh_token";

  static getToken(): InternalToken.Token | null {
    const tokenString = localStorage.getItem(this.tokenKey);
    if (tokenString) {
      try {
        return JSON.parse(tokenString);
      } catch {
        return null;
      }
    }
    return null;
  }

  static saveToken(token: InternalToken.Token): void {
    localStorage.setItem(this.tokenKey, JSON.stringify(token));
  }

  static clearToken(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
  }

  static getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  static saveRefreshToken(token: string): void {
    localStorage.setItem(this.refreshTokenKey, token);
  }

  static clearRefreshToken(): void {
    localStorage.removeItem(this.refreshTokenKey);
  }
}
