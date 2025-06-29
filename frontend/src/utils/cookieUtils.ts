// Generate a unique device ID to prevent cookie conflicts between devices
const getDeviceId = (): string => {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
};

export const setCookie = (name: string, value: string, days: number = 7) => {
    const deviceId = getDeviceId();
    const deviceSpecificName = `${name}_${deviceId}`;
    console.log(`setCookie called: ${deviceSpecificName} = ${value}`);
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = `expires=${date.toUTCString()}`;
    const cookieString = `${deviceSpecificName}=${value};${expires};path=/;SameSite=Lax`;
    console.log(`Setting cookie: ${cookieString}`);
    document.cookie = cookieString;
    console.log(`Cookies after setting: ${document.cookie}`);
};

export const getCookie = (name: string): string | null => {
    const deviceId = getDeviceId();
    const deviceSpecificName = `${name}_${deviceId}`;
    console.log(`getCookie called for: ${deviceSpecificName}`);
    console.log(`document.cookie: ${document.cookie}`);
    
    const cookieName = `${deviceSpecificName}=`;
    const cookies = document.cookie.split(';');
    console.log(`All cookies split:`, cookies);
    
    for (let i = 0; i < cookies.length; i++) {
        let cookie = cookies[i].trim();
        console.log(`Checking cookie: "${cookie}" against "${cookieName}"`);
        if (cookie.indexOf(cookieName) === 0) {
            const value = cookie.substring(cookieName.length, cookie.length);
            console.log(`Found cookie ${deviceSpecificName}: ${value}`);
            return value;
        }
    }
    console.log(`Cookie ${deviceSpecificName} not found`);
    return null;
};

export const removeCookie = (name: string) => {
    const deviceId = getDeviceId();
    const deviceSpecificName = `${name}_${deviceId}`;
    document.cookie = `${deviceSpecificName}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}; 