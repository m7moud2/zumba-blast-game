/**
 * Zumba Blast - High-Performance 60FPS Marble Shooter Engine
 * Authentic Zuma / Luxor chain reaction mechanics with physics & particle effects.
 */

const COLORS = [
    { name: 'red', hex: '#ef4444', glow: '#f87171', border: '#b91c1c' },
    { name: 'blue', hex: '#3b82f6', glow: '#60a5fa', border: '#1d4ed8' },
    { name: 'green', hex: '#10b981', glow: '#34d399', border: '#047857' },
    { name: 'yellow', hex: '#f59e0b', glow: '#fbbf24', border: '#b45309' },
    { name: 'purple', hex: '#8b5cf6', glow: '#a78bfa', border: '#6d28d9' }
];

const MARBLE_RADIUS = 16;
const MARBLE_DIAMETER = MARBLE_RADIUS * 2;
const SHOOT_SPEED = 20;

class ZumbaGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = 900;
        this.height = 600;

        // Player & Game State
        this.score = 0;
        this.coins = parseInt(localStorage.getItem('zumba_coins') || '250');
        this.lives = 3;
        this.currentLevel = 1;
        this.unlockedLevel = parseInt(localStorage.getItem('zumba_unlocked_level') || '1');
        this.gameState = 'menu'; // menu, playing, paused, gameover, victory, levelselect

        // Cannon / Launcher
        this.cannon = {
            x: 450,
            y: 320,
            angle: 0,
            currentMarble: null,
            nextMarble: null,
            radius: 36
        };

        // Active project shot
        this.activeShot = null;

        // Waypoints track
        this.trackPoints = [];
        this.chain = []; // Marbles on track
        this.particles = [];
        this.floatingTexts = [];

        // Mechanics modifiers
        this.isFrozen = false;
        this.freezeTimer = 0;
        this.isReversing = false;
        this.reverseTimer = 0;
        this.comboCount = 0;
        this.levelMarblesTotal = 40;
        this.marblesSpawned = 0;
        this.spawnTimer = 0;

        // Mouse / Touch
        this.mousePos = { x: 450, y: 150 };

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.setupControls();
        this.generateTrack(1);
        this.prepareCannon();
        this.updateHUD();

        // Game Loop
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    resize() {
        // Fit canvas to parent container preserving aspect ratio
        const container = document.getElementById('game-container');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const scale = Math.min(rect.width / this.width, rect.height / this.height);
        this.scale = scale;
    }

    setupControls() {
        const updateMouse = (clientX, clientY) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mousePos.x = (clientX - rect.left) * (this.width / rect.width);
            this.mousePos.y = (clientY - rect.top) * (this.height / rect.height);

            const dx = this.mousePos.x - this.cannon.x;
            const dy = this.mousePos.y - this.cannon.y;
            this.cannon.angle = Math.atan2(dy, dx);
        };

        this.canvas.addEventListener('mousemove', (e) => updateMouse(e.clientX, e.clientY));
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.shoot();
            } else if (e.button === 2) {
                e.preventDefault();
                this.swapMarbles();
            }
        });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Touch support
        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                updateMouse(e.touches[0].clientX, e.touches[0].clientY);
                e.preventDefault();
            }
        }, { passive: false });

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                updateMouse(e.touches[0].clientX, e.touches[0].clientY);
                this.shoot();
                e.preventDefault();
            }
        }, { passive: false });

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                this.swapMarbles();
                e.preventDefault();
            }
        });
    }

    generateTrack(levelNum) {
        this.trackPoints = [];
        const pts = [];

        if (levelNum % 3 === 1) {
            // Spiral Path (Classic Zuma)
            const cx = 450, cy = 300;
            for (let t = 0; t <= Math.PI * 5.2; t += 0.05) {
                const r = 360 - (t * 26);
                if (r < 60) break;
                pts.push({
                    x: cx + Math.cos(t) * r,
                    y: cy + Math.sin(t) * (r * 0.72)
                });
            }
        } else if (levelNum % 3 === 2) {
            // Double S-Curve track
            for (let t = 0; t <= 1; t += 0.003) {
                const x = 80 + (t * 740);
                const y = 300 + Math.sin(t * Math.PI * 3.5) * 190;
                pts.push({ x, y });
            }
        } else {
            // Infinity Loop track
            for (let t = 0; t <= Math.PI * 2; t += 0.015) {
                const scale = 340;
                const denom = 1 + Math.sin(t) * Math.sin(t);
                const x = 450 + (scale * Math.cos(t)) / denom;
                const y = 300 + (scale * Math.sin(t) * Math.cos(t)) / denom;
                pts.push({ x, y });
            }
        }

        // Subsample points to uniform 2px distance
        this.trackPoints = [pts[0]];
        let accDist = 0;
        for (let i = 1; i < pts.length; i++) {
            const dx = pts[i].x - pts[i - 1].x;
            const dy = pts[i].y - pts[i - 1].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            accDist += dist;
            if (accDist >= 2.5) {
                this.trackPoints.push(pts[i]);
                accDist = 0;
            }
        }

        this.cavePoint = this.trackPoints[this.trackPoints.length - 1];
    }

    startLevel(level) {
        this.currentLevel = level;
        this.generateTrack(level);
        this.chain = [];
        this.activeShot = null;
        this.marblesSpawned = 0;
        this.levelMarblesTotal = 30 + (level * 8);
        this.isFrozen = false;
        this.isReversing = false;
        this.comboCount = 0;
        this.gameState = 'playing';
        this.prepareCannon();
        this.updateHUD();

        document.querySelectorAll('.game-overlay').forEach(el => el.classList.add('hidden'));
        document.getElementById('hud-panel').classList.remove('hidden');
    }

    getRandomColor() {
        // Only spawn colors currently present in chain if possible
        if (this.chain.length > 5 && Math.random() < 0.75) {
            const available = [...new Set(this.chain.map(m => m.color.name))];
            const choice = available[Math.floor(Math.random() * available.length)];
            const found = COLORS.find(c => c.name === choice);
            if (found) return found;
        }
        return COLORS[Math.floor(Math.random() * COLORS.length)];
    }

    createMarble(dist = 0, color = null, power = 'normal') {
        const assignedColor = color || this.getRandomColor();
        // Rare chance of power-up
        let pType = power;
        if (power === 'normal' && Math.random() < 0.08) {
            const types = ['bomb', 'reverse', 'freeze', 'rainbow'];
            pType = types[Math.floor(Math.random() * types.length)];
        }

        return {
            dist: dist, // Index in trackPoints
            color: assignedColor,
            power: pType,
            radius: MARBLE_RADIUS
        };
    }

    prepareCannon() {
        if (!this.cannon.currentMarble) {
            this.cannon.currentMarble = this.createMarble(0, this.getRandomColor(), 'normal');
        }
        this.cannon.nextMarble = this.createMarble(0, this.getRandomColor(), 'normal');
    }

    swapMarbles() {
        if (this.gameState !== 'playing') return;
        const temp = this.cannon.currentMarble;
        this.cannon.currentMarble = this.cannon.nextMarble;
        this.cannon.nextMarble = temp;
        window.gameAudio.swap();
    }

    shoot() {
        if (this.gameState !== 'playing' || this.activeShot) return;

        const cos = Math.cos(this.cannon.angle);
        const sin = Math.sin(this.cannon.angle);

        this.activeShot = {
            x: this.cannon.x + cos * 40,
            y: this.cannon.y + sin * 40,
            vx: cos * SHOOT_SPEED,
            vy: sin * SHOOT_SPEED,
            color: this.cannon.currentMarble.color,
            power: this.cannon.currentMarble.power,
            radius: MARBLE_RADIUS
        };

        window.gameAudio.shoot();

        // Advance queue
        this.cannon.currentMarble = this.cannon.nextMarble;
        this.cannon.nextMarble = this.createMarble(0, this.getRandomColor(), 'normal');
    }

    useBooster(type) {
        if (this.gameState !== 'playing') return;
        const costs = { bomb: 50, freeze: 40, reverse: 30 };
        const cost = costs[type] || 50;

        if (this.coins < cost) {
            alert('Not enough gold coins! Watch a video ad or clear levels to earn coins.');
            return;
        }

        this.coins -= cost;
        localStorage.setItem('zumba_coins', this.coins);
        this.updateHUD();

        if (type === 'bomb') {
            this.cannon.currentMarble.power = 'bomb';
            window.gameAudio.coin();
        } else if (type === 'freeze') {
            this.isFrozen = true;
            this.freezeTimer = 240; // 4 seconds at 60fps
            window.gameAudio.freeze();
            this.addFloatingText('❄️ FREEZE!', 450, 200, '#38bdf8');
        } else if (type === 'reverse') {
            this.isReversing = true;
            this.reverseTimer = 180; // 3 seconds
            window.gameAudio.reverse();
            this.addFloatingText('⏪ REWIND!', 450, 200, '#f59e0b');
        }
    }

    update(delta) {
        if (this.gameState !== 'playing') return;

        // 1. Timers
        if (this.isFrozen) {
            this.freezeTimer--;
            if (this.freezeTimer <= 0) this.isFrozen = false;
        }

        if (this.isReversing) {
            this.reverseTimer--;
            if (this.reverseTimer <= 0) this.isReversing = false;
        }

        // 2. Spawn incoming marbles
        if (this.marblesSpawned < this.levelMarblesTotal) {
            this.spawnTimer++;
            const spawnInterval = Math.max(14, 28 - this.currentLevel);
            if (this.spawnTimer >= spawnInterval) {
                this.spawnTimer = 0;
                // Add marble at track start
                const newM = this.createMarble(0);
                this.chain.unshift(newM);
                this.marblesSpawned++;
            }
        }

        // 3. Move chain along path
        let speed = this.isFrozen ? 0 : this.isReversing ? -2.2 : (1.1 + (this.currentLevel * 0.1));
        
        // Push marbles forwards ensuring minimum distance (packing)
        for (let i = 0; i < this.chain.length; i++) {
            this.chain[i].dist += speed;
            if (i > 0) {
                // Ensure no overlapping
                const minDist = (MARBLE_DIAMETER / 2.5); // Approx track distance units
                if (this.chain[i].dist < this.chain[i - 1].dist + minDist) {
                    this.chain[i].dist = this.chain[i - 1].dist + minDist;
                }
            }
        }

        // 4. Check lose condition (reached cave mouth)
        if (this.chain.length > 0) {
            const head = this.chain[this.chain.length - 1];
            if (head.dist >= this.trackPoints.length - 15) {
                this.handleLevelLost();
                return;
            }
        }

        // 5. Update active shot projectile
        if (this.activeShot) {
            this.activeShot.x += this.activeShot.vx;
            this.activeShot.y += this.activeShot.vy;

            // Check collision against rolling chain
            let hitIndex = -1;
            for (let i = 0; i < this.chain.length; i++) {
                const m = this.chain[i];
                const pt = this.getPointAtDist(m.dist);
                const dx = this.activeShot.x - pt.x;
                const dy = this.activeShot.y - pt.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < MARBLE_RADIUS * 1.85) {
                    hitIndex = i;
                    break;
                }
            }

            if (hitIndex !== -1) {
                this.handleShotCollision(hitIndex);
                this.activeShot = null;
            } else if (
                this.activeShot.x < -40 || this.activeShot.x > this.width + 40 ||
                this.activeShot.y < -40 || this.activeShot.y > this.height + 40
            ) {
                this.activeShot = null; // Out of bounds
            }
        }

        // 6. Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.025;
            if (p.alpha <= 0) this.particles.splice(i, 1);
        }

        // 7. Update floating text
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.y -= 1.2;
            ft.alpha -= 0.02;
            if (ft.alpha <= 0) this.floatingTexts.splice(i, 1);
        }

        // 8. Check victory condition (all spawned and chain cleared)
        if (this.marblesSpawned >= this.levelMarblesTotal && this.chain.length === 0) {
            this.handleLevelWon();
        }
    }

    handleShotCollision(hitIndex) {
        const shot = this.activeShot;
        const hitMarble = this.chain[hitIndex];

        // Power-up triggers
        if (shot.power === 'bomb') {
            this.triggerBomb(hitIndex);
            return;
        }

        // Determine if shot should be inserted before or after
        const insertIndex = hitIndex + 1;
        const newMarble = {
            dist: hitMarble.dist + (MARBLE_DIAMETER / 2.5),
            color: shot.power === 'rainbow' ? hitMarble.color : shot.color,
            power: shot.power,
            radius: MARBLE_RADIUS
        };

        this.chain.splice(insertIndex, 0, newMarble);

        // Check for matches (>= 3 contiguous identical colors)
        this.checkMatches(insertIndex);
    }

    checkMatches(startIndex) {
        if (startIndex < 0 || startIndex >= this.chain.length) return;
        const targetColor = this.chain[startIndex].color.name;

        let left = startIndex;
        while (left > 0 && this.chain[left - 1].color.name === targetColor) {
            left--;
        }

        let right = startIndex;
        while (right < this.chain.length - 1 && this.chain[right + 1].color.name === targetColor) {
            right++;
        }

        const matchCount = right - left + 1;
        if (matchCount >= 3) {
            this.comboCount++;
            const points = matchCount * 100 * this.comboCount;
            this.score += points;

            // Spawn particles & explosions
            for (let i = left; i <= right; i++) {
                const pt = this.getPointAtDist(this.chain[i].dist);
                this.spawnExplosion(pt.x, pt.y, this.chain[i].color.hex);

                // Handle power-ups inside matched set
                if (this.chain[i].power === 'bomb') this.triggerBomb(i);
                if (this.chain[i].power === 'reverse') { this.isReversing = true; this.reverseTimer = 180; }
                if (this.chain[i].power === 'freeze') { this.isFrozen = true; this.freezeTimer = 240; }
            }

            const centerPt = this.getPointAtDist(this.chain[startIndex].dist);
            if (this.comboCount > 1) {
                this.addFloatingText(`${this.comboCount}x COMBO! +${points}`, centerPt.x, centerPt.y - 20, '#fbbf24');
                window.gameAudio.combo(this.comboCount);
            } else {
                this.addFloatingText(`+${points}`, centerPt.x, centerPt.y - 20, '#34d399');
                window.gameAudio.pop();
            }

            // Remove matched marbles
            this.chain.splice(left, matchCount);
            this.updateHUD();

            // Magnetic snap-back check
            if (left > 0 && left < this.chain.length) {
                if (this.chain[left - 1].color.name === this.chain[left].color.name) {
                    // Recursive cascade match!
                    setTimeout(() => {
                        this.checkMatches(left);
                    }, 120);
                }
            }
        } else {
            this.comboCount = 0;
            window.gameAudio.shoot();
        }
    }

    triggerBomb(centerIdx) {
        window.gameAudio.bomb();
        const start = Math.max(0, centerIdx - 3);
        const count = Math.min(this.chain.length - start, 7);

        for (let i = start; i < start + count; i++) {
            const pt = this.getPointAtDist(this.chain[i].dist);
            this.spawnExplosion(pt.x, pt.y, '#f59e0b', 24);
        }

        const centerPt = this.getPointAtDist(this.chain[centerIdx].dist);
        this.addFloatingText('💥 BOOM! +500', centerPt.x, centerPt.y - 30, '#ef4444');
        this.score += 500;
        this.chain.splice(start, count);
        this.updateHUD();
    }

    spawnExplosion(x, y, color, count = 16) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 2 + Math.random() * 4,
                color,
                alpha: 1
            });
        }
    }

    addFloatingText(text, x, y, color = '#ffffff') {
        this.floatingTexts.push({ text, x, y, color, alpha: 1 });
    }

    getPointAtDist(dist) {
        const idx = Math.min(Math.max(0, Math.floor(dist)), this.trackPoints.length - 1);
        return this.trackPoints[idx] || { x: 0, y: 0 };
    }

    handleLevelWon() {
        this.gameState = 'victory';
        window.gameAudio.win();

        const earnedCoins = 50 + (this.currentLevel * 10);
        this.coins += earnedCoins;
        localStorage.setItem('zumba_coins', this.coins);

        if (this.currentLevel >= this.unlockedLevel) {
            this.unlockedLevel = this.currentLevel + 1;
            localStorage.setItem('zumba_unlocked_level', this.unlockedLevel);
        }

        document.getElementById('victory-level').textContent = this.currentLevel;
        document.getElementById('victory-score').textContent = this.score;
        document.getElementById('victory-coins').textContent = `+${earnedCoins} Gold Coins`;
        document.getElementById('victory-modal').classList.remove('hidden');

        // Trigger AdMob interstitial between levels
        window.adManager.showInterstitial();
    }

    handleLevelLost() {
        this.gameState = 'gameover';
        window.gameAudio.lose();

        document.getElementById('gameover-score').textContent = this.score;
        document.getElementById('gameover-modal').classList.remove('hidden');
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        // 1. Draw Jungle Temple Background
        this.drawBackground();

        // 2. Draw Track Path & Cave
        this.drawTrack();

        // 3. Draw Marbles in Chain
        this.drawChain();

        // 4. Draw Totem Launcher / Cannon
        this.drawCannon();

        // 5. Draw Active Shot Projectile
        this.drawActiveShot();

        // 6. Draw Particles
        this.drawParticles();

        // 7. Draw Floating Texts
        this.drawFloatingTexts();
    }

    drawBackground() {
        // Atmospheric gradient
        const bg = this.ctx.createRadialGradient(450, 300, 50, 450, 300, 550);
        bg.addColorStop(0, '#064e3b'); // Emerald deep jungle
        bg.addColorStop(0.7, '#022c22');
        bg.addColorStop(1, '#051914');
        this.ctx.fillStyle = bg;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Decorative Mayan stone carvings / vines
        this.ctx.strokeStyle = 'rgba(16, 185, 129, 0.08)';
        this.ctx.lineWidth = 2;
        for (let i = 0; i < this.width; i += 60) {
            this.ctx.beginPath();
            this.ctx.arc(i, 0, 45, 0, Math.PI);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.arc(i, this.height, 45, Math.PI, 0);
            this.ctx.stroke();
        }
    }

    drawTrack() {
        if (this.trackPoints.length < 2) return;

        // Deep Stone Groove
        this.ctx.beginPath();
        this.ctx.moveTo(this.trackPoints[0].x, this.trackPoints[0].y);
        for (let i = 1; i < this.trackPoints.length; i++) {
            this.ctx.lineTo(this.trackPoints[i].x, this.trackPoints[i].y);
        }
        this.ctx.strokeStyle = '#021c15';
        this.ctx.lineWidth = 36;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();

        // Inner glowing golden path
        this.ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
        this.ctx.lineWidth = 14;
        this.ctx.stroke();

        // Cave Mouth (Golden Skull / Temple entrance)
        if (this.cavePoint) {
            this.ctx.fillStyle = '#0f172a';
            this.ctx.beginPath();
            this.ctx.arc(this.cavePoint.x, this.cavePoint.y, 32, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = '#f59e0b';
            this.ctx.lineWidth = 4;
            this.ctx.stroke();

            // Skull eyes glow
            this.ctx.fillStyle = '#ef4444';
            this.ctx.beginPath();
            this.ctx.arc(this.cavePoint.x - 10, this.cavePoint.y - 6, 5, 0, Math.PI * 2);
            this.ctx.arc(this.cavePoint.x + 10, this.cavePoint.y - 6, 5, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    drawChain() {
        for (let i = 0; i < this.chain.length; i++) {
            const m = this.chain[i];
            const pt = this.getPointAtDist(m.dist);
            this.drawMarble(pt.x, pt.y, m.color, m.power);
        }
    }

    drawMarble(x, y, color, power = 'normal') {
        this.ctx.save();
        this.ctx.translate(x, y);

        // Radial Sphere gradient
        const grad = this.ctx.createRadialGradient(-5, -5, 2, 0, 0, MARBLE_RADIUS);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.35, color.glow);
        grad.addColorStop(0.85, color.hex);
        grad.addColorStop(1, color.border);

        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, MARBLE_RADIUS, 0, Math.PI * 2);
        this.ctx.fill();

        // Outer Ring
        this.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        // Power-up Icon Badge
        if (power === 'bomb') {
            this.ctx.fillStyle = '#1e293b';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('💣', 0, 0);
        } else if (power === 'reverse') {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 11px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('⏪', 0, 0);
        } else if (power === 'freeze') {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 11px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('❄️', 0, 0);
        } else if (power === 'rainbow') {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 11px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('★', 0, 0);
        }

        this.ctx.restore();
    }

    drawCannon() {
        this.ctx.save();
        this.ctx.translate(this.cannon.x, this.cannon.y);
        this.ctx.rotate(this.cannon.angle);

        // Aiming Guideline Dots
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        for (let d = 55; d < 220; d += 22) {
            this.ctx.beginPath();
            this.ctx.arc(d, 0, 2.5, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.restore();

        // Mayan Totem Base (Golden Platform)
        this.ctx.fillStyle = '#1e293b';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.cannon.radius + 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#f59e0b';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        // Cannon Barrel
        this.ctx.fillStyle = '#334155';
        this.ctx.beginPath();
        this.ctx.roundRect(10, -14, 38, 28, 8);
        this.ctx.fill();
        this.ctx.strokeStyle = '#f59e0b';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Next marble queue (nested inside totem rear)
        if (this.cannon.nextMarble) {
            this.ctx.save();
            this.ctx.scale(0.65, 0.65);
            this.drawMarble(-30, 0, this.cannon.nextMarble.color, this.cannon.nextMarble.power);
            this.ctx.restore();
        }

        // Current marble ready in mouth
        if (this.cannon.currentMarble) {
            this.drawMarble(18, 0, this.cannon.currentMarble.color, this.cannon.currentMarble.power);
        }

        this.ctx.restore();
    }

    drawActiveShot() {
        if (!this.activeShot) return;
        this.drawMarble(this.activeShot.x, this.activeShot.y, this.activeShot.color, this.activeShot.power);
    }

    drawParticles() {
        for (const p of this.particles) {
            this.ctx.save();
            this.ctx.globalAlpha = p.alpha;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    drawFloatingTexts() {
        for (const ft of this.floatingTexts) {
            this.ctx.save();
            this.ctx.globalAlpha = ft.alpha;
            this.ctx.fillStyle = ft.color;
            this.ctx.font = '900 16px "Inter", Arial';
            this.ctx.textAlign = 'center';
            this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
            this.ctx.shadowBlur = 6;
            this.ctx.fillText(ft.text, ft.x, ft.y);
            this.ctx.restore();
        }
    }

    updateHUD() {
        const scoreEl = document.getElementById('hud-score');
        const coinsEl = document.getElementById('hud-coins');
        const levelEl = document.getElementById('hud-level');
        const progressEl = document.getElementById('hud-progress-fill');

        if (scoreEl) scoreEl.textContent = this.score;
        if (coinsEl) coinsEl.textContent = this.coins;
        if (levelEl) levelEl.textContent = `Level ${this.currentLevel}`;
        if (progressEl) {
            const pct = Math.min(100, (this.marblesSpawned / this.levelMarblesTotal) * 100);
            progressEl.style.width = `${pct}%`;
        }
    }

    loop(timestamp) {
        const delta = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        this.update(delta);
        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }
}

window.onload = () => {
    window.game = new ZumbaGame();
};
