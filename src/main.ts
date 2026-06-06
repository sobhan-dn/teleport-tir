import Phaser from "phaser";
import "./styles.css";

const WORLD_WIDTH = 900;
const WORLD_HEIGHT = 1600;
const PLAYER_SPEED = 380;
const ENEMY_SPEED = 260;
const SHOT_SPEED = 760;
const TELEPORT_SPEED = 600;

type ShotKind = "normal" | "teleport";

type Controls = {
  moveX: number;
  moveY: number;
  shotKind: ShotKind;
  fireQueued: boolean;
  teleportQueued: boolean;
};

class ArenaScene extends Phaser.Scene {
  constructor() {
    super("ArenaScene");
  }

  private controls: Controls = {
    moveX: 0,
    moveY: 0,
    shotKind: "normal",
    fireQueued: false,
    teleportQueued: false
  };

  private player!: Phaser.GameObjects.Sprite;
  private enemy!: Phaser.GameObjects.Sprite;
  private playerShots: Phaser.GameObjects.Arc[] = [];
  private enemyShots: Phaser.GameObjects.Arc[] = [];
  private teleportOrb?: Phaser.GameObjects.Arc;
  private decoyFish: Phaser.GameObjects.Sprite[] = [];
  private playerShotAngle = 0;
  private playerHp = 100;
  private enemyHp = 100;
  private enemyFireTimer = 0;
  private messageTimer = 0;
  private gameOver = false;
  private hud = {
    playerHealth: document.querySelector<HTMLElement>("#playerHealth")!,
    enemyHealth: document.querySelector<HTMLElement>("#enemyHealth")!,
    modeLabel: document.querySelector<HTMLDivElement>("#modeLabel")!,
    toast: document.querySelector<HTMLDivElement>("#toast")!,
    blink: document.querySelector<HTMLButtonElement>("#blink")!
  };

  preload() {
    this.load.image("arena", "assets/underwater-arena.jpg");
    this.load.image("fish", "assets/fish.png");
  }

  create() {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, "arena").setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);

    this.player = this.add.sprite(210, 1180, "fish").setScale(0.12).setOrigin(0.5);
    this.enemy = this.add.sprite(690, 360, "fish").setScale(0.12).setOrigin(0.5);
    this.enemy.setFlipX(true);
    this.enemyFireTimer = 2.4;

    this.addFishCrowd();
    this.addPlayerAura(this.player);
    this.addPlayerAura(this.enemy);

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(130, 190);
    this.cameras.main.setZoom(1);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.queueFire(pointer));
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && pointer.y < this.scale.height * 0.72) {
        this.aimFishAt(pointer);
      }
    });

    this.showMessage("با تیر معمولی حریف را بزن، با تیر تلپورت جای خودت را عوض کن");
    this.syncHud();
  }

  update(time: number, deltaMs: number) {
    const delta = deltaMs / 1000;
    if (this.gameOver) {
      this.animateFish(this.player, time, 1);
      this.animateFish(this.enemy, time, -1);
      return;
    }

    this.movePlayer(delta);
    this.moveEnemy(delta, time);
    this.processFire();
    this.processTeleport();
    this.updateShots(this.playerShots, delta, this.enemy, "enemy");
    this.updateShots(this.enemyShots, delta, this.player, "player");
    this.updateTeleportOrb(delta);
    this.animateFish(this.player, time, 1);
    this.animateFish(this.enemy, time, -1);
    this.decoyFish.forEach((fish, index) => this.animateFish(fish, time, index * 0.37));
    this.updateToast(deltaMs);
  }

  setControls(controls: Controls) {
    this.controls = controls;
  }

  private addFishCrowd() {
    for (let i = 0; i < 64; i += 1) {
      const x = Phaser.Math.Between(80, WORLD_WIDTH - 80);
      const y = Phaser.Math.Between(170, WORLD_HEIGHT - 160);
      const fish = this.add.sprite(x, y, "fish").setScale(0.12).setOrigin(0.5);
      fish.setAlpha(1);
      const movingLeft = Math.random() > 0.5;
      fish.setFlipX(movingLeft);
      fish.setDepth(3);
      this.decoyFish.push(fish);
      this.addPlayerAura(fish);

      const swimX = Phaser.Math.Between(145, 300) * (movingLeft ? -1 : 1);
      const swimY = Phaser.Math.Between(-145, 145);
      this.tweens.add({
        targets: fish,
        x: Phaser.Math.Clamp(x + swimX, 55, WORLD_WIDTH - 55),
        y: Phaser.Math.Clamp(y + swimY, 120, WORLD_HEIGHT - 110),
        yoyo: true,
        repeat: -1,
        duration: Phaser.Math.Between(1200, 3200),
        ease: "Sine.inOut",
        onYoyo: () => fish.toggleFlipX(),
        onRepeat: () => fish.toggleFlipX()
      });
      this.tweens.add({
        targets: fish,
        rotation: Phaser.Math.FloatBetween(-0.16, 0.16),
        yoyo: true,
        repeat: -1,
        duration: Phaser.Math.Between(420, 900),
        ease: "Sine.inOut"
      });
    }
  }

  private addPlayerAura(target: Phaser.GameObjects.Sprite) {
    const color = 0xa9fbff;
    const ring = this.add.ellipse(target.x, target.y, 148, 100, color, 0.15);
    ring.setStrokeStyle(3, color, 0.5);
    ring.setDepth(2);
    target.setDepth(3);
    this.tweens.add({
      targets: ring,
      scaleX: 1.13,
      scaleY: 1.13,
      alpha: 0.08,
      yoyo: true,
      repeat: -1,
      duration: 900,
      ease: "Sine.inOut",
      onUpdate: () => ring.setPosition(target.x, target.y)
    });
  }

  private movePlayer(delta: number) {
    const length = Math.hypot(this.controls.moveX, this.controls.moveY) || 1;
    const vx = (this.controls.moveX / length) * PLAYER_SPEED * delta;
    const vy = (this.controls.moveY / length) * PLAYER_SPEED * delta;
    if (Math.abs(this.controls.moveX) + Math.abs(this.controls.moveY) > 0.06) {
      this.playerShotAngle = Math.atan2(this.controls.moveY, this.controls.moveX);
      this.player.x = Phaser.Math.Clamp(this.player.x + vx, 70, WORLD_WIDTH - 70);
      this.player.y = Phaser.Math.Clamp(this.player.y + vy, 105, WORLD_HEIGHT - 90);
      this.player.setFlipX(this.controls.moveX < -0.05);
    }
  }

  private moveEnemy(delta: number, time: number) {
    const desiredX = this.player.x + Math.sin(time / 820) * 260;
    const desiredY = this.player.y - 520 + Math.cos(time / 1170) * 180;
    const angle = Phaser.Math.Angle.Between(this.enemy.x, this.enemy.y, desiredX, desiredY);
    this.enemy.x = Phaser.Math.Clamp(this.enemy.x + Math.cos(angle) * ENEMY_SPEED * delta, 70, WORLD_WIDTH - 70);
    this.enemy.y = Phaser.Math.Clamp(this.enemy.y + Math.sin(angle) * ENEMY_SPEED * delta, 105, WORLD_HEIGHT - 90);
    this.enemy.setFlipX(this.enemy.x > this.player.x);

    this.enemyFireTimer -= delta;
    if (this.enemyFireTimer <= 0) {
      this.enemyFireTimer = Phaser.Math.FloatBetween(1.9, 2.75);
      this.spawnShot(this.enemy, this.player, "normal", false);
    }
  }

  private processFire() {
    if (!this.controls.fireQueued) return;
    this.controls.fireQueued = false;
    if (this.controls.shotKind === "teleport" && this.teleportOrb) {
      this.showMessage("فقط یک تیر تلپورت فعال می‌تواند در آب شنا کند");
      return;
    }
    this.spawnShot(this.player, this.enemy, this.controls.shotKind, true, this.playerShotAngle);
  }

  private processTeleport() {
    if (!this.controls.teleportQueued) return;
    this.controls.teleportQueued = false;
    if (!this.teleportOrb) {
      this.showMessage("اول تیر تلپورت را شلیک کن");
      return;
    }
    this.burst(this.player.x, this.player.y, 0x69faff);
    this.player.setPosition(this.teleportOrb.x, this.teleportOrb.y);
    this.burst(this.player.x, this.player.y, 0xffda76);
    this.teleportOrb.destroy();
    this.teleportOrb = undefined;
    this.hud.blink.disabled = true;
    this.cameras.main.shake(130, 0.006);
    this.showMessage("تلپورت!");
  }

  private updateShots(shots: Phaser.GameObjects.Arc[], delta: number, target: Phaser.GameObjects.Sprite, targetName: "player" | "enemy") {
    for (let i = shots.length - 1; i >= 0; i -= 1) {
      const shot = shots[i];
      shot.x += Math.cos(Number(shot.getData("angle"))) * SHOT_SPEED * delta;
      shot.y += Math.sin(Number(shot.getData("angle"))) * SHOT_SPEED * delta;
      shot.setData("life", Number(shot.getData("life")) - delta);

      if (Phaser.Math.Distance.Between(shot.x, shot.y, target.x, target.y) < 78) {
        shots.splice(i, 1);
        shot.destroy();
        this.applyHit(targetName);
        continue;
      }

      if (Number(shot.getData("life")) <= 0 || !this.isInsideWorld(shot.x, shot.y)) {
        shots.splice(i, 1);
        shot.destroy();
      }
    }
  }

  private updateTeleportOrb(delta: number) {
    if (!this.teleportOrb) return;
    const orb = this.teleportOrb;
    let angle = Number(orb.getData("angle"));
    orb.x += Math.cos(angle) * TELEPORT_SPEED * delta;
    orb.y += Math.sin(angle) * TELEPORT_SPEED * delta;
    if (orb.x < 30 || orb.x > WORLD_WIDTH - 30) {
      angle = Math.PI - angle;
      orb.x = Phaser.Math.Clamp(orb.x, 30, WORLD_WIDTH - 30);
      orb.setData("angle", angle);
    }
    if (orb.y < 30 || orb.y > WORLD_HEIGHT - 30) {
      angle = -angle;
      orb.y = Phaser.Math.Clamp(orb.y, 30, WORLD_HEIGHT - 30);
      orb.setData("angle", angle);
    }
    orb.setData("life", Number(orb.getData("life")) - delta);
    orb.rotation += delta * 6;
    if (Number(orb.getData("life")) <= 0) {
      orb.destroy();
      this.teleportOrb = undefined;
      this.hud.blink.disabled = true;
      this.showMessage("تیر تلپورت محو شد");
    }
  }

  private spawnShot(origin: Phaser.GameObjects.Sprite, target: Phaser.GameObjects.Sprite, kind: ShotKind, fromPlayer: boolean, forcedAngle?: number) {
    const angle = forcedAngle ?? Phaser.Math.Angle.Between(origin.x, origin.y, target.x, target.y);
    const color = kind === "normal" ? 0xfff28a : 0x72fff5;
    const radius = kind === "normal" ? 12 : 18;
    const shot = this.add.circle(origin.x + Math.cos(angle) * 82, origin.y + Math.sin(angle) * 82, radius, color, 0.95);
    shot.setStrokeStyle(3, kind === "normal" ? 0xff7d47 : 0x1167ff, 0.8);
    shot.setData("angle", angle);
    shot.setData("life", kind === "normal" ? 1.45 : 10);
    shot.setDepth(5);

    this.tweens.add({
      targets: shot,
      scale: kind === "normal" ? 1.24 : 1.36,
      alpha: 0.72,
      yoyo: true,
      repeat: -1,
      duration: 160,
      ease: "Sine.inOut"
    });

    if (kind === "teleport") {
      this.teleportOrb = shot;
      this.hud.blink.disabled = false;
      this.showMessage("هر وقت خواستی دکمه تلپورت را بزن");
      return;
    }

    if (fromPlayer) {
      this.playerShots.push(shot);
    } else {
      this.enemyShots.push(shot);
    }
  }

  private applyHit(targetName: "player" | "enemy") {
    const target = targetName === "player" ? this.player : this.enemy;
    const damage = targetName === "player" ? 12 : 20;
    if (targetName === "player") {
      this.playerHp = Math.max(0, this.playerHp - damage);
    } else {
      this.enemyHp = Math.max(0, this.enemyHp - damage);
    }
    this.burst(target.x, target.y, 0xffe47a);
    this.cameras.main.shake(100, 0.004);
    this.syncHud();

    if (this.playerHp <= 0 || this.enemyHp <= 0) {
      this.gameOver = true;
      const won = this.enemyHp <= 0;
      this.showMessage(won ? "بردی! ماهی حریف شکار شد" : "حریف برد. دوباره امتحان کن");
      setTimeout(() => window.location.reload(), 1800);
    }
  }

  private burst(x: number, y: number, color: number) {
    for (let i = 0; i < 12; i += 1) {
      const dot = this.add.circle(x, y, Phaser.Math.Between(3, 7), color, 0.9).setDepth(7);
      this.tweens.add({
        targets: dot,
        x: x + Phaser.Math.Between(-95, 95),
        y: y + Phaser.Math.Between(-95, 95),
        alpha: 0,
        scale: 0.2,
        duration: 430,
        ease: "Cubic.out",
        onComplete: () => dot.destroy()
      });
    }
  }

  private animateFish(fish: Phaser.GameObjects.Sprite, time: number, phase: number) {
    const wave = Math.sin(time / 170 + phase);
    fish.rotation = wave * 0.045;
    fish.scaleX = 0.12 * (1 + wave * 0.04);
    fish.scaleY = 0.12 * (1 - wave * 0.025);
  }

  private queueFire(pointer: Phaser.Input.Pointer) {
    if (pointer.y > this.scale.height * 0.72) return;
    this.aimFishAt(pointer);
    this.controls.fireQueued = true;
  }

  private aimFishAt(pointer: Phaser.Input.Pointer) {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.player.setFlipX(worldPoint.x < this.player.x);
  }

  private syncHud() {
    this.hud.playerHealth.textContent = String(this.playerHp);
    this.hud.enemyHealth.textContent = String(this.enemyHp);
    this.hud.modeLabel.textContent = this.controls.shotKind === "normal" ? "تیر: معمولی" : "تیر: تلپورت";
  }

  private updateToast(deltaMs: number) {
    if (this.messageTimer <= 0) return;
    this.messageTimer -= deltaMs;
    if (this.messageTimer <= 0) {
      this.hud.toast.style.opacity = "0";
    }
  }

  private showMessage(text: string) {
    this.hud.toast.textContent = text;
    this.hud.toast.style.opacity = "0.94";
    this.messageTimer = 2200;
  }

  private isInsideWorld(x: number, y: number) {
    return x > 15 && x < WORLD_WIDTH - 15 && y > 15 && y < WORLD_HEIGHT - 15;
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-root",
  backgroundColor: "#063047",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT
  },
  render: {
    antialias: true,
    pixelArt: false,
    powerPreference: "high-performance"
  },
  scene: ArenaScene
});

const sceneControls: Controls = {
  moveX: 0,
  moveY: 0,
  shotKind: "normal",
  fireQueued: false,
  teleportQueued: false
};

const normalShot = document.querySelector<HTMLButtonElement>("#normalShot")!;
const teleportShot = document.querySelector<HTMLButtonElement>("#teleportShot")!;
const blink = document.querySelector<HTMLButtonElement>("#blink")!;
const modeLabel = document.querySelector<HTMLDivElement>("#modeLabel")!;
const stick = document.querySelector<HTMLDivElement>("#stick")!;
const stickKnob = document.querySelector<HTMLDivElement>("#stickKnob")!;
const pressedKeys = new Set<string>();

function activeScene() {
  return game.scene.getScene("ArenaScene") as ArenaScene | undefined;
}

function pushControls() {
  activeScene()?.setControls(sceneControls);
}

function setShotKind(kind: ShotKind) {
  sceneControls.shotKind = kind;
  normalShot.classList.toggle("selected", kind === "normal");
  teleportShot.classList.toggle("selected", kind === "teleport");
  modeLabel.textContent = kind === "normal" ? "تیر: معمولی" : "تیر: تلپورت";
  pushControls();
}

normalShot.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  setShotKind("normal");
  sceneControls.fireQueued = true;
  pushControls();
});

teleportShot.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  setShotKind("teleport");
  sceneControls.fireQueued = true;
  pushControls();
});

blink.disabled = true;
blink.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  sceneControls.teleportQueued = true;
  pushControls();
});

window.addEventListener("keydown", (event) => {
  const keyCode = normalizedKeyCode(event);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyR", "KeyE", "ShiftLeft", "ShiftRight"].includes(keyCode)) {
    event.preventDefault();
  }
  if (pressedKeys.has(keyCode) && !["Space", "KeyR", "KeyE", "ShiftLeft", "ShiftRight"].includes(keyCode)) return;
  pressedKeys.add(keyCode);
  if (keyCode === "Space" || keyCode === "KeyR") {
    setShotKind("normal");
    sceneControls.fireQueued = true;
  }
  if (keyCode === "KeyE") {
    if (blink.disabled) {
      setShotKind("teleport");
      sceneControls.fireQueued = true;
    } else {
      sceneControls.teleportQueued = true;
    }
  }
  if (keyCode === "ShiftLeft" || keyCode === "ShiftRight") {
    sceneControls.teleportQueued = true;
  }
  updateKeyboardMove();
  pushControls();
});

window.addEventListener("keyup", (event) => {
  pressedKeys.delete(normalizedKeyCode(event));
  updateKeyboardMove();
  pushControls();
});

let stickPointerId: number | null = null;

stick.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  stickPointerId = event.pointerId;
  stick.setPointerCapture(event.pointerId);
  updateStick(event);
});

stick.addEventListener("pointermove", (event) => {
  if (stickPointerId !== event.pointerId) return;
  event.preventDefault();
  updateStick(event);
});

stick.addEventListener("pointerup", releaseStick);
stick.addEventListener("pointercancel", releaseStick);

function updateStick(event: PointerEvent) {
  const rect = stick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const max = rect.width * 0.33;
  const dx = Phaser.Math.Clamp(event.clientX - centerX, -max, max);
  const dy = Phaser.Math.Clamp(event.clientY - centerY, -max, max);
  const length = Math.hypot(dx, dy);
  const normalized = length > max ? max / length : 1;
  const knobX = dx * normalized;
  const knobY = dy * normalized;
  sceneControls.moveX = knobX / max;
  sceneControls.moveY = knobY / max;
  stickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
  pushControls();
}

function releaseStick(event: PointerEvent) {
  if (stickPointerId !== event.pointerId) return;
  stickPointerId = null;
  sceneControls.moveX = 0;
  sceneControls.moveY = 0;
  stickKnob.style.transform = "translate(-50%, -50%)";
  pushControls();
}

function updateKeyboardMove() {
  const left = pressedKeys.has("ArrowLeft") || pressedKeys.has("KeyA");
  const right = pressedKeys.has("ArrowRight") || pressedKeys.has("KeyD");
  const up = pressedKeys.has("ArrowUp") || pressedKeys.has("KeyW");
  const down = pressedKeys.has("ArrowDown") || pressedKeys.has("KeyS");
  sceneControls.moveX = Number(right) - Number(left);
  sceneControls.moveY = Number(down) - Number(up);
}

function normalizedKeyCode(event: KeyboardEvent) {
  if (event.code) return event.code;
  const key = event.key.toLowerCase();
  if (key === " ") return "Space";
  if (key === "shift") return "ShiftLeft";
  if (key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright") return event.key;
  if (key.length === 1 && key >= "a" && key <= "z") return `Key${key.toUpperCase()}`;
  return event.key;
}
