import React from "react";
import { graphicsPolicy } from "../utils/graphicsPolicy";

export const buildGraphicsOptInHref = (
  pathname = "/dither-canvas",
  search = "",
) => {
  const params = new URLSearchParams(search);
  params.set("graphics", "webgl");
  return `${pathname}?${params.toString()}`;
};

const GraphicsFallbackPage = () => {
  const pathname = window.location.pathname || "/dither-canvas";
  const tryWebGLHref = buildGraphicsOptInHref(
    pathname,
    window.location.search,
  );

  return (
    <main className="graphics-fallback-page">
      <div className="graphics-fallback-page__field" aria-hidden="true">
        <span />
        <span />
        <span />
        <i />
      </div>

      <section aria-labelledby="graphics-fallback-title">
        <p>Popular Consulting · Graphics safety</p>
        <h1 id="graphics-fallback-title">The field lab is in safe mode.</h1>
        <p>
          This browser session is using the CSS rendering path so an unstable
          graphics driver cannot interrupt the rest of the site.
        </p>
        <p className="graphics-fallback-page__reason">
          Policy: {graphicsPolicy.source}
        </p>
        <div>
          <a href={tryWebGLHref}>Try enhanced graphics</a>
          <a href="/">Return to Popular Consulting</a>
        </div>
      </section>

      <style>{`
        .graphics-fallback-page {
          position: fixed;
          inset: 0;
          display: grid;
          place-items: center;
          overflow: hidden;
          padding: 2rem;
          box-sizing: border-box;
          background: #080809;
          color: rgba(245, 245, 255, 0.92);
          font-family: 'Poppins', sans-serif;
        }

        .graphics-fallback-page__field,
        .graphics-fallback-page__field i {
          position: absolute;
          inset: 0;
        }

        .graphics-fallback-page__field span {
          position: absolute;
          display: block;
          width: 58vmax;
          height: 58vmax;
          border-radius: 50%;
          filter: blur(70px);
          opacity: 0.28;
          animation: graphicsFallbackDrift 18s ease-in-out infinite;
        }

        .graphics-fallback-page__field span:nth-child(1) {
          top: -18%;
          left: -8%;
          background: radial-gradient(circle, #6344f5, transparent 68%);
        }

        .graphics-fallback-page__field span:nth-child(2) {
          right: -20%;
          bottom: -16%;
          background: radial-gradient(circle, #24ccff, transparent 68%);
          animation-delay: -6s;
        }

        .graphics-fallback-page__field span:nth-child(3) {
          left: 32%;
          bottom: -34%;
          background: radial-gradient(circle, #52e5a0, transparent 68%);
          animation-delay: -11s;
        }

        .graphics-fallback-page__field i {
          background-image: radial-gradient(
            circle at 1px 1px,
            rgba(255,255,255,0.12) 0 1px,
            transparent 1.5px
          );
          background-size: 24px 24px;
        }

        .graphics-fallback-page section {
          position: relative;
          z-index: 1;
          width: min(720px, 100%);
          padding: clamp(2rem, 5vw, 4.5rem);
          box-sizing: border-box;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 28px;
          background: rgba(8, 8, 16, 0.74);
          backdrop-filter: blur(24px) saturate(130%);
          -webkit-backdrop-filter: blur(24px) saturate(130%);
          box-shadow: 0 24px 80px rgba(0,0,0,0.34);
        }

        .graphics-fallback-page section > p:first-child {
          margin: 0 0 1rem;
          color: #9b72ff;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .graphics-fallback-page h1 {
          margin: 0;
          font-size: clamp(2.2rem, 6vw, 4.8rem);
          line-height: 1.02;
        }

        .graphics-fallback-page h1 + p {
          max-width: 58ch;
          margin: 1.5rem 0 0;
          color: rgba(235,235,250,0.72);
          font-size: clamp(1rem, 2vw, 1.2rem);
          line-height: 1.7;
        }

        .graphics-fallback-page__reason {
          margin: 1rem 0 0;
          color: rgba(235,235,250,0.48);
          font-size: 0.82rem;
        }

        .graphics-fallback-page section > div {
          display: flex;
          flex-wrap: wrap;
          gap: 0.8rem;
          margin-top: 2rem;
        }

        .graphics-fallback-page a {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          padding: 0.75rem 1.2rem;
          border: 1px solid rgba(155,114,255,0.5);
          border-radius: 999px;
          color: #ffffff;
          text-decoration: none;
          background: rgba(99,68,245,0.18);
        }

        .graphics-fallback-page a:last-child {
          border-color: rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.06);
        }

        .graphics-fallback-page a:focus-visible {
          outline: 3px solid #ffffff;
          outline-offset: 4px;
        }

        @keyframes graphicsFallbackDrift {
          0%, 100% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(4vw,-3vh,0) scale(1.08); }
        }

        @media (prefers-reduced-motion: reduce) {
          .graphics-fallback-page__field span { animation: none; }
        }
      `}</style>
    </main>
  );
};

export default GraphicsFallbackPage;
