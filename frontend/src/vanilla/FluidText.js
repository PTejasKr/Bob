export class FluidText {
  constructor(container, options = {}) {
    this.container = container;
    this.text = options.text || "";
    this.maxScale = options.maxScale || 2.0;
    this.radius = options.radius || 200;
    this.stiffness = options.stiffness || 0.15;
    this.fadeDuration = options.fadeDuration || 700;
    
    this.spans = [];
    this.charWidths = [];
    this.totalNaturalWidth = 0;
    this.isMeasured = false;
    this.targetX = -9999;
    this.currentX = -9999;
    this.targetIntensity = 0;
    this.currentIntensity = 0;
    this.frameId = null;

    this.init();
  }

  init() {
    this.container.style.position = 'relative';
    this.container.style.display = 'inline-block';
    this.container.style.cursor = 'crosshair';
    this.container.style.userSelect = 'none';
    this.container.style.whiteSpace = 'nowrap';
    this.container.style.lineHeight = '1';

    // Layer 1: Animated
    this.animatedLayer = document.createElement('div');
    this.animatedLayer.className = 'satis-fluid-text-animated';
    this.animatedLayer.style.position = 'absolute';
    this.animatedLayer.style.top = '0';
    this.animatedLayer.style.left = '0';
    this.animatedLayer.style.width = '100%';
    this.animatedLayer.style.height = '100%';
    this.animatedLayer.style.display = 'block';
    this.animatedLayer.style.opacity = '0';
    this.animatedLayer.style.transition = `opacity ${this.fadeDuration}ms ease-out`;
    this.animatedLayer.style.pointerEvents = 'none';
    this.animatedLayer.style.willChange = 'opacity';
    
    const chars = this.text.split('');
    chars.forEach((char) => {
      const span = document.createElement('span');
      span.className = 'satis-fluid-char';
      span.style.position = 'absolute';
      span.style.top = '0';
      span.style.left = '0';
      span.style.display = 'inline-block';
      span.style.transformOrigin = '0% 50%';
      span.style.textAlign = 'left';
      span.style.backfaceVisibility = 'hidden';
      span.style.transformStyle = 'preserve-3d';
      span.style.willChange = 'transform';
      span.textContent = char === ' ' ? '\u00A0' : char;
      this.spans.push(span);
      this.animatedLayer.appendChild(span);
    });

    // Layer 2: Invisible clone for layout
    this.cloneLayer = document.createElement('span');
    this.cloneLayer.className = 'satis-fluid-text-clone';
    this.cloneLayer.style.display = 'block';
    this.cloneLayer.style.visibility = 'hidden';
    this.cloneLayer.style.opacity = '0';
    this.cloneLayer.style.pointerEvents = 'none';
    this.cloneLayer.style.userSelect = 'none';
    this.cloneLayer.style.whiteSpace = 'pre';
    this.cloneLayer.style.lineHeight = '1';
    this.cloneLayer.textContent = this.text;

    this.container.appendChild(this.animatedLayer);
    this.container.appendChild(this.cloneLayer);

    this.bindEvents();
    
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => this.measure());
    } else {
      this.measure();
    }
  }

  measure() {
    this.spans.forEach(span => { span.style.transform = 'none'; });
    
    this.charWidths = this.spans.map(span => span.getBoundingClientRect().width);
    if (this.charWidths.length === 0 || this.charWidths.every(w => w === 0)) {
        setTimeout(() => this.measure(), 100);
        return;
    }

    this.totalNaturalWidth = this.charWidths.reduce((sum, w) => sum + w, 0);
    this.isMeasured = true;
    this.animatedLayer.style.opacity = '1';
    
    this.startLoop();
  }

  bindEvents() {
    this.onMouseMove = (e) => {
      const rect = this.container.getBoundingClientRect();
      this.targetX = e.clientX - rect.left;
      if (this.targetIntensity === 0) {
        this.currentX = e.clientX - rect.left;
      }
      this.targetIntensity = 1;
    };
    
    this.onMouseLeave = () => {
      this.targetIntensity = 0;
    };
    
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(this.container);
    
    this.container.addEventListener('mousemove', this.onMouseMove);
    this.container.addEventListener('mouseleave', this.onMouseLeave);
  }

  startLoop() {
    if (this.frameId) return;
    const loop = () => {
      if (!this.isMeasured) {
        this.frameId = requestAnimationFrame(loop);
        return;
      }

      const posDelta = this.targetX - this.currentX;
      this.currentX += posDelta * this.stiffness;

      const intDelta = this.targetIntensity - this.currentIntensity;
      this.currentIntensity += intDelta * 0.08;

      let totalDesiredWidth = 0;
      const desiredScales = [];

      this.charWidths.forEach((w, i) => {
        let offset = 0;
        for (let j = 0; j < i; j++) offset += this.charWidths[j];
        const charCenter = offset + w / 2;

        const dist = Math.abs(charCenter - this.currentX);
        let desiredScale = 1.0;
        
        if (dist < this.radius) {
          const normalized = dist / this.radius;
          const curve = Math.cos(normalized * (Math.PI / 2));
          desiredScale = 1 + (this.maxScale - 1) * curve * this.currentIntensity;
        }
        
        desiredScales[i] = desiredScale;
        totalDesiredWidth += w * desiredScale;
      });

      const k = totalDesiredWidth === 0 ? 1 : this.totalNaturalWidth / totalDesiredWidth;

      let currentLayoutX = 0;
      this.spans.forEach((span, i) => {
        const w = this.charWidths[i];
        const finalScale = desiredScales[i] * k;
        span.style.transform = `translate3d(${currentLayoutX.toFixed(2)}px, 0, 0) scaleX(${finalScale.toFixed(3)})`;
        currentLayoutX += w * finalScale;
      });

      this.frameId = requestAnimationFrame(loop);
    };
    this.frameId = requestAnimationFrame(loop);
  }

  destroy() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.container.removeEventListener('mousemove', this.onMouseMove);
    this.container.removeEventListener('mouseleave', this.onMouseLeave);
    this.resizeObserver.disconnect();
    this.container.innerHTML = '';
  }
}
