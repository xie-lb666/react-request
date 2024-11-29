export class TokenManager {
  private static tokenKey = "auth_token";

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

  // 当调用删除 token的接口、刷新失败时 应该触发清除 
  static clearToken(): void {
    localStorage.removeItem(this.tokenKey);
  }

}
