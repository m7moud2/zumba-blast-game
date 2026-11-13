/**
 * Zumba Blast - Monetization & AdMob Integration Module
 * Supports Google AdMob (Banner, Interstitial, Rewarded Video)
 * Includes native Android Java interface hooks & simulated web preview.
 */
class AdManager {
    constructor() {
        this.rewardCoins = 100;
        this.admobConfig = {
            bannerAdId: 'ca-app-pub-3940256099942544/6300978111', // Test IDs
            interstitialAdId: 'ca-app-pub-3940256099942544/1033173712',
            rewardedAdId: 'ca-app-pub-3940256099942544/5224354917'
        };
        this.init();
    }

    init() {
        // Detect native Android Bridge if running inside Android Studio WebView
        this.isAndroid = typeof window.Android !== 'undefined';
        console.log('AdManager initialized. Platform: ' + (this.isAndroid ? 'Native Android' : 'Web/HTML5'));
    }

    showBanner() {
        if (this.isAndroid && window.Android.showBanner) {
            window.Android.showBanner();
        } else {
            const banner = document.getElementById('ad-banner-placeholder');
            if (banner) banner.classList.remove('hidden');
        }
    }

    hideBanner() {
        if (this.isAndroid && window.Android.hideBanner) {
            window.Android.hideBanner();
        } else {
            const banner = document.getElementById('ad-banner-placeholder');
            if (banner) banner.classList.add('hidden');
        }
    }

    showInterstitial(onCloseCallback) {
        if (this.isAndroid && window.Android.showInterstitial) {
            window.onInterstitialClosed = () => {
                if (onCloseCallback) onCloseCallback();
            };
            window.Android.showInterstitial();
        } else {
            // Simulated Interstitial Ad on Web
            this.showSimulatedAd('interstitial', onCloseCallback);
        }
    }

    showRewarded(onRewardCallback) {
        if (this.isAndroid && window.Android.showRewarded) {
            window.onRewardedGranted = () => {
                if (onRewardCallback) onRewardCallback(this.rewardCoins);
            };
            window.Android.showRewarded();
        } else {
            // Simulated Rewarded Ad on Web
            this.showSimulatedAd('rewarded', () => {
                if (onRewardCallback) onRewardCallback(this.rewardCoins);
            });
        }
    }

    showSimulatedAd(type, callback) {
        const modal = document.getElementById('ad-modal');
        const title = document.getElementById('ad-modal-title');
        const timer = document.getElementById('ad-modal-timer');
        const closeBtn = document.getElementById('ad-modal-close');

        if (!modal) {
            if (callback) callback();
            return;
        }

        let secondsLeft = type === 'rewarded' ? 5 : 3;
        if (title) title.textContent = type === 'rewarded' ? '📺 Rewarded Video Ad (Watch to earn +100 Coins)' : '📢 Sponsored Interstitial Ad';
        if (timer) timer.textContent = `Reward in ${secondsLeft}s...`;
        if (closeBtn) closeBtn.classList.add('hidden');

        modal.classList.remove('hidden');

        const interval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft > 0) {
                if (timer) timer.textContent = `Ad closing in ${secondsLeft}s...`;
            } else {
                clearInterval(interval);
                if (timer) timer.textContent = '✓ Reward Unlocked! You can close now.';
                if (closeBtn) {
                    closeBtn.classList.remove('hidden');
                    closeBtn.onclick = () => {
                        modal.classList.add('hidden');
                        if (callback) callback();
                    };
                }
            }
        }, 1000);
    }
}

window.adManager = new AdManager();
