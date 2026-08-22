import re

with open("frontend/src/App.css", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Fix .pokedex-app-root (add flex-direction: column;)
content = content.replace(
    ".pokedex-app-root {\n  position: relative;\n  width: 100vw;\n  height: 100vh;\n  display: flex;\n  justify-content: center;",
    ".pokedex-app-root {\n  position: relative;\n  width: 100vw;\n  height: 100vh;\n  display: flex;\n  flex-direction: column;\n  justify-content: center;"
)

# 2. Add .backend-insights CSS
css = """
.backend-insights {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 25;
  width: 90%;
  max-width: 1100px;
  background: rgba(12, 14, 18, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.backend-insights-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding-bottom: 1rem;
}

.backend-eyebrow {
  font-family: "Chakra Petch", sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #38bdf8;
  text-transform: uppercase;
}

.backend-insights-heading h2 {
  font-family: "Space Grotesk", sans-serif;
  font-size: 1.5rem;
  font-weight: 600;
  color: #ffffff;
  margin: 0.25rem 0 0 0;
}

.backend-target {
  font-family: "JetBrains Mono", monospace;
  font-size: 0.75rem;
  color: #00e676;
  background: rgba(0, 230, 118, 0.1);
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  border: 1px solid rgba(0, 230, 118, 0.2);
}

.backend-terms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
}

.backend-term {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 1rem;
  border-radius: 12px;
  transition: background 0.2s;
}

.backend-term:hover {
  background: rgba(255, 255, 255, 0.06);
}

.backend-term span {
  font-family: "JetBrains Mono", monospace;
  font-size: 0.8rem;
  font-weight: 600;
  color: #38bdf8;
  display: block;
  margin-bottom: 0.5rem;
}

.backend-term p {
  font-size: 0.85rem;
  color: #94a3b8;
  margin: 0;
  line-height: 1.5;
}

.wallpaper-fluid-bob-hero {
  position: absolute;
  top: 10%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 15rem;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.9);
  text-transform: uppercase;
  letter-spacing: -0.05em;
  pointer-events: none;
  text-shadow: 0 10px 40px rgba(255, 255, 255, 0.4);
}
"""

with open("frontend/src/App.css", "w", encoding="utf-8") as f:
    f.write(content + "\n" + css)
