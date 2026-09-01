import React from "react";
import { createPortal } from "react-dom";
import { useThemeMode } from "../contexts/ThemeContext";
import { getSiteCopy, SITE_AUDIENCES } from "../content/siteCopy";
import nodeLogo from "../assets/icons/popcon_svg.svg";
import "./BusinessSystemsVisual.css";

const BUSINESS_BIO_COPY = getSiteCopy(SITE_AUDIENCES.BUSINESS).bio;
const BUSINESS_SECTION_INDEX = 1;
const LIGHT_MODE_LOGO_CONTRAST_FILTER =
  "brightness(0.46) saturate(1.55) drop-shadow(0 0 4px var(--business-visual-glow))";

const SYSTEM_NODES = Object.freeze([
  Object.freeze({
    id: "strategy",
    label: "Strategy",
    x: 180,
    y: 82,
    labelWidth: 78,
    delay: "0s",
    rotationDuration: "11s",
    rotationDirection: "normal",
  }),
  Object.freeze({
    id: "software",
    label: "Software",
    x: 292,
    y: 190,
    labelWidth: 82,
    delay: "-2.4s",
    rotationDuration: "14s",
    rotationDirection: "reverse",
  }),
  Object.freeze({
    id: "commerce",
    label: "Commerce",
    x: 180,
    y: 298,
    labelWidth: 84,
    delay: "-4.8s",
    rotationDuration: "12s",
    rotationDirection: "normal",
  }),
  Object.freeze({
    id: "ai",
    label: "AI",
    x: 68,
    y: 190,
    labelWidth: 52,
    delay: "-7.2s",
    rotationDuration: "15s",
    rotationDirection: "reverse",
  }),
]);

const SYSTEM_CONNECTIONS = Object.freeze([
  Object.freeze({
    id: "strategy",
    path: "M180 138 C180 126 180 112 180 104",
    delay: "0s",
  }),
  Object.freeze({
    id: "software",
    path: "M232 190 C248 190 262 190 270 190",
    delay: "-0.9s",
  }),
  Object.freeze({
    id: "commerce",
    path: "M180 242 C180 256 180 270 180 276",
    delay: "-1.8s",
  }),
  Object.freeze({
    id: "ai",
    path: "M128 190 C112 190 98 190 90 190",
    delay: "-2.7s",
  }),
]);

const DELIVERY_STAGES = Object.freeze([
  "Discover",
  "Design",
  "Deliver",
  "Support",
]);

const escapeCssAttribute = (value) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const findPortraitImage = (photoAlt) =>
  Array.from(document.querySelectorAll("#bio img")).find(
    (image) => image.getAttribute("alt") === photoAlt,
  ) || null;

const getInitialSectionActive = () =>
  typeof window !== "undefined" &&
  window.location.hash === `#section-${BUSINESS_SECTION_INDEX}`;

const useReducedMotion = () => {
  const [reducedMotion, setReducedMotion] = React.useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  React.useEffect(() => {
    if (!window.matchMedia) return undefined;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = (event) => setReducedMotion(event.matches);

    setReducedMotion(query.matches);
    if (query.addEventListener) {
      query.addEventListener("change", updatePreference);
      return () => query.removeEventListener("change", updatePreference);
    }

    query.addListener(updatePreference);
    return () => query.removeListener(updatePreference);
  }, []);

  return reducedMotion;
};

const BusinessSystemsVisual = () => {
  const { isDark } = useThemeMode();
  const photoAlt = BUSINESS_BIO_COPY.photoAlt;
  const escapedPhotoAlt = escapeCssAttribute(photoAlt);
  const reducedMotion = useReducedMotion();
  const [hostElement, setHostElement] = React.useState(null);
  const [sectionActive, setSectionActive] = React.useState(
    getInitialSectionActive,
  );
  const [documentVisible, setDocumentVisible] = React.useState(
    () => typeof document === "undefined" || !document.hidden,
  );

  React.useLayoutEffect(() => {
    let boundImage = null;
    let boundHost = null;
    let observer = null;
    let previousDisplay = "";
    let previousAriaHidden = null;

    const attachToPortraitHost = () => {
      if (boundHost) return true;

      const image = findPortraitImage(photoAlt);
      const host = image?.parentElement;
      if (!image || !host) return false;

      boundImage = image;
      boundHost = host;
      previousDisplay = image.style.display;
      previousAriaHidden = image.getAttribute("aria-hidden");

      image.style.display = "none";
      image.setAttribute("aria-hidden", "true");
      image.setAttribute("data-business-portrait-hidden", "true");
      host.setAttribute("data-business-visual-host", "true");
      setHostElement(host);
      return true;
    };

    if (!attachToPortraitHost() && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        if (attachToPortraitHost()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      if (boundImage) {
        boundImage.style.display = previousDisplay;
        if (previousAriaHidden === null) {
          boundImage.removeAttribute("aria-hidden");
        } else {
          boundImage.setAttribute("aria-hidden", previousAriaHidden);
        }
        boundImage.removeAttribute("data-business-portrait-hidden");
      }

      boundHost?.removeAttribute("data-business-visual-host");
    };
  }, [photoAlt]);

  React.useEffect(() => {
    const handleSectionStart = (event) => {
      const nextSection = Number(event.detail?.to);
      setSectionActive(nextSection === BUSINESS_SECTION_INDEX);
    };
    const handleSectionEnd = (event) => {
      const currentSection = Number(event.detail?.index);
      setSectionActive(currentSection === BUSINESS_SECTION_INDEX);
    };
    const handleVisibilityChange = () => setDocumentVisible(!document.hidden);

    window.addEventListener("sectionChangeStart", handleSectionStart);
    window.addEventListener("sectionChangeEnd", handleSectionEnd);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("sectionChangeStart", handleSectionStart);
      window.removeEventListener("sectionChangeEnd", handleSectionEnd);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const animationActive = sectionActive && documentVisible && !reducedMotion;

  const visual = (
    <div
      className={`business-systems-visual${
        animationActive ? " business-systems-visual--active" : ""
      }${reducedMotion ? " business-systems-visual--reduced" : ""}`}
      data-testid="business-systems-visual"
      role="img"
      aria-label="Animated systems map showing rotating Popular Consulting marks for strategy, software, AI, and commerce connected around the client's business from discovery through support."
    >
      <div className="business-systems-visual__ambient" aria-hidden="true" />

      <svg
        className="business-systems-visual__map"
        viewBox="0 0 360 360"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient
            id="business-system-spectrum"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop offset="0%" stopColor="#00EEFF" />
            <stop offset="42%" stopColor="#FF00FF" />
            <stop offset="72%" stopColor="#FFEE00" />
            <stop offset="100%" stopColor="#9D00FF" />
          </linearGradient>
          <radialGradient id="business-system-core" cx="50%" cy="38%" r="72%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
            <stop offset="68%" stopColor="#ffffff" stopOpacity="0.78" />
            <stop offset="100%" stopColor="#00EEFF" stopOpacity="0.10" />
          </radialGradient>
        </defs>

        <rect
          className="business-systems-visual__frame"
          x="18"
          y="14"
          width="324"
          height="336"
          rx="24"
        />
        <path
          className="business-systems-visual__frame-rule"
          d="M42 44 H318"
        />
        <text
          className="business-systems-visual__map-kicker"
          x="42"
          y="34"
        >
          POPULAR CONSULTING / SYSTEM MAP
        </text>

        <circle
          className="business-systems-visual__orbit business-systems-visual__orbit--outer business-systems-visual__motion"
          cx="180"
          cy="190"
          r="112"
        />
        <circle
          className="business-systems-visual__orbit business-systems-visual__orbit--inner business-systems-visual__motion"
          cx="180"
          cy="190"
          r="76"
        />

        <g className="business-systems-visual__ticks">
          <path d="M180 54 V64" />
          <path d="M316 190 H306" />
          <path d="M180 326 V316" />
          <path d="M44 190 H54" />
        </g>

        {SYSTEM_CONNECTIONS.map((connection) => (
          <g key={connection.id}>
            <path
              className="business-systems-visual__connection"
              d={connection.path}
            />
            <path
              className="business-systems-visual__connection-flow business-systems-visual__motion"
              d={connection.path}
              style={{ "--flow-delay": connection.delay }}
            />
          </g>
        ))}

        {SYSTEM_NODES.map((node) => (
          <g
            className="business-systems-visual__node"
            data-system-node={node.id}
            key={node.id}
            transform={`translate(${node.x} ${node.y})`}
            style={{ "--node-delay": node.delay }}
          >
            <circle
              className="business-systems-visual__node-ring business-systems-visual__motion"
              r="25"
            />
            <circle className="business-systems-visual__node-surface" r="20" />
            <image
              className="business-systems-visual__node-logo-image business-systems-visual__motion"
              href={nodeLogo}
              x="-12"
              y="-12"
              width="24"
              height="24"
              preserveAspectRatio="xMidYMid meet"
              style={{
                "--logo-delay": node.delay,
                "--logo-duration": node.rotationDuration,
                "--logo-direction": node.rotationDirection,
                filter: isDark
                  ? undefined
                  : LIGHT_MODE_LOGO_CONTRAST_FILTER,
                opacity: isDark ? undefined : 1,
              }}
            />
            <g className="business-systems-visual__node-label">
              <rect
                x={-node.labelWidth / 2}
                y="31"
                width={node.labelWidth}
                height="20"
                rx="10"
              />
              <text textAnchor="middle" y="44">
                {node.label}
              </text>
            </g>
          </g>
        ))}

        <g className="business-systems-visual__core">
          <circle
            className="business-systems-visual__core-halo business-systems-visual__motion"
            cx="180"
            cy="190"
            r="56"
          />
          <circle
            className="business-systems-visual__core-surface"
            cx="180"
            cy="190"
            r="48"
          />
          <image
            className="business-systems-visual__core-logo"
            href={nodeLogo}
            x="168"
            y="154"
            width="24"
            height="24"
            preserveAspectRatio="xMidYMid meet"
            style={{
              filter: isDark ? undefined : LIGHT_MODE_LOGO_CONTRAST_FILTER,
              opacity: isDark ? undefined : 1,
            }}
          />
          <text
            className="business-systems-visual__core-kicker"
            x="180"
            y="193"
            textAnchor="middle"
          >
            BUILT AROUND
          </text>
          <text
            className="business-systems-visual__core-title"
            x="180"
            y="211"
            textAnchor="middle"
          >
            YOUR BUSINESS
          </text>
          <path
            className="business-systems-visual__core-rule"
            d="M150 221 H210"
          />
        </g>
      </svg>

      <div className="business-systems-visual__delivery" aria-hidden="true">
        <span className="business-systems-visual__delivery-label">
          One accountable path
        </span>
        <div className="business-systems-visual__delivery-track">
          {DELIVERY_STAGES.map((stage, index) => (
            <React.Fragment key={stage}>
              <span
                className="business-systems-visual__stage business-systems-visual__motion"
                style={{ "--stage-delay": `${index * 2 - 8}s` }}
              >
                <span className="business-systems-visual__stage-dot" />
                {stage}
              </span>
              {index < DELIVERY_STAGES.length - 1 && (
                <span className="business-systems-visual__stage-line" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        [data-site-audience="business"] #bio img[alt="${escapedPhotoAlt}"] {
          display: none !important;
        }
      `}</style>
      {hostElement ? createPortal(visual, hostElement) : null}
    </>
  );
};

export default BusinessSystemsVisual;
