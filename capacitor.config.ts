import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dikam.paymentorder',
  appName: 'dlkam',
  webDir: 'dist',
  server: {
    // Allows loading from external domains (HTTP/HTTPS)
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: ['*'] 
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    LocalNotifications: {
      smallIcon: "ic_stat_dlkam",
      iconColor: "#2563EB",
      sound: "default"
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#0f172a",
      androidSplashResourceName: "splash",
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;
