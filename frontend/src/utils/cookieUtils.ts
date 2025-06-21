export const setCookie = (name: string, value: string, days: number = 7) => {
    console.log(`setCookie called: ${name} = ${value}`);
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = `expires=${date.toUTCString()}`;
    const cookieString = `${name}=${value};${expires};path=/;SameSite=Lax`;
    console.log(`Setting cookie: ${cookieString}`);
    document.cookie = cookieString;
    console.log(`Cookies after setting: ${document.cookie}`);
};

export const getCookie = (name: string): string | null => {
    console.log(`getCookie called for: ${name}`);
    console.log(`document.cookie: ${document.cookie}`);
    
    const cookieName = `${name}=`;
    const cookies = document.cookie.split(';');
    console.log(`All cookies split:`, cookies);
    
    for (let i = 0; i < cookies.length; i++) {
        let cookie = cookies[i].trim();
        console.log(`Checking cookie: "${cookie}" against "${cookieName}"`);
        if (cookie.indexOf(cookieName) === 0) {
            const value = cookie.substring(cookieName.length, cookie.length);
            console.log(`Found cookie ${name}: ${value}`);
            return value;
        }
    }
    console.log(`Cookie ${name} not found`);
    return null;
};

export const removeCookie = (name: string) => {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}; 