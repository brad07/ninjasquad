import type { SenseiRecommendation } from './SenseiService';
import { isPermissionGranted, requestPermission, sendNotification as tauriSendNotification } from '@tauri-apps/plugin-notification';

class DesktopNotificationService {
  private permissionGranted: boolean = false;
  private lastActivityTime: number = Date.now();
  private activityThreshold: number = 60000; // 1 minute of inactivity = away
  private activityCheckInterval?: number;

  constructor() {
    this.checkPermission();
    this.setupActivityTracking();
  }

  private async checkPermission() {
    try {
      this.permissionGranted = await isPermissionGranted();
      console.log('Notification permission status:', this.permissionGranted);
    } catch (error) {
      console.error('Error checking notification permission:', error);
      this.permissionGranted = false;
    }
  }

  public async requestPermission(): Promise<boolean> {
    if (this.permissionGranted) {
      return true;
    }

    try {
      const permission = await requestPermission();
      this.permissionGranted = permission === 'granted';
      console.log('Notification permission requested, result:', permission);
      return this.permissionGranted;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  private setupActivityTracking() {
    // Track user activity
    const updateActivity = () => {
      this.lastActivityTime = Date.now();
    };

    // Track various user interactions
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });

    // Check activity periodically
    this.activityCheckInterval = window.setInterval(() => {
      // Just maintain the interval, actual checks happen on-demand
    }, 10000);
  }

  public isUserActive(): boolean {
    const timeSinceLastActivity = Date.now() - this.lastActivityTime;
    return timeSinceLastActivity < this.activityThreshold;
  }

  public isUserAway(): boolean {
    return !this.isUserActive();
  }

  public async sendNotification(
    recommendation: SenseiRecommendation,
    projectName: string
  ): Promise<void> {
    console.log('📢 sendNotification called:', {
      hasPermission: this.permissionGranted,
      projectName,
      recId: recommendation.id,
      confidence: recommendation.confidence
    });

    // Ensure we have permission
    if (!this.permissionGranted) {
      console.log('⚠️ No permission, requesting...');
      const granted = await this.requestPermission();
      if (!granted) {
        console.log('❌ Desktop notification permission denied');
        return;
      }
      console.log('✅ Permission granted');
    }

    // Check if this is an error
    const isError = recommendation.confidence === 0 &&
                   recommendation.recommendation.startsWith('Analysis error:');

    const title = isError
      ? '⚠️ SensAI Analysis Failed'
      : '🧠 SensAI Recommendation';

    const body = isError
      ? recommendation.recommendation.substring(0, 200)
      : `${recommendation.recommendation.substring(0, 200)}${recommendation.recommendation.length > 200 ? '...' : ''}`;

    console.log('📝 Notification content:', { title, bodyLength: body.length });

    try {
      console.log('🚀 Calling tauriSendNotification with:', { title, body });

      // sendNotification is synchronous, not async
      tauriSendNotification({
        title,
        body
      });

      console.log('✅ Desktop notification sent successfully:', title);

      // Emit event to show the recommendation
      window.dispatchEvent(new CustomEvent('notification-clicked', {
        detail: { recommendationId: recommendation.id }
      }));
    } catch (error) {
      console.error('❌ Error showing desktop notification:', error);
      throw error;
    }
  }

  public destroy() {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
    }
  }
}

export const desktopNotificationService = new DesktopNotificationService();