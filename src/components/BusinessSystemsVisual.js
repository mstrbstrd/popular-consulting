import React from "react";
import { createPortal } from "react-dom";
import { getSiteCopy, SITE_AUDIENCES } from "../content/siteCopy";
import "./BusinessSystemsVisual.css";

const BUSINESS_BIO_COPY = getSiteCopy(SITE_AUDIENCES.BUSINESS).bio;
const BUSINESS_SECTION_INDEX = 1;

const SYSTEM_NODES = Object.freeze([
  Object.freeze({
    id: "strategy",
    label: "Strategy",
    x: 180,
    y: 78,
    delay: "0s",
  }),
  Object.freeze({
    id: "software",
    label: "Software",
    x: 294,
    y: 204,
    delay: "-1.2s",
  }),
  Object.freeze({
    id: "commerce",
    label: "Commerce",
    x: 180,
    y: 330,
    delay: "-2.4s",
  }),
  Object.freeze({
    id: "ai",
    label: "AI",
    x: 66,
    y: 204,
    delay: "-3.6s",
  }),
]);

const SYSTEM_CONNECTIONS = Object.freeze([
  Object.freeze({
    id: "strategy",
    path: "M180 178 C180 142 180 116 180 96",
    delay: "0s",
  }),
  Object.freeze({
    id: "software",
    path: "M224 204 C248 204 266 204 276 204",
    delay: "-0.9s",
  }),
  Object.freeze({
    id: "commerce",
    path: "M180 230 C180 264 180 292 180 312",
    delay: "-1.8s",
  }),
  Object.freeze({
    id: "ai",
    path: "M136 204 C112 204 94 204 84 204",
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
      aria-label="Animated systems map showing strategy, software, AI, and commerce connected around the client's business from discovery through support."
    >
      <div className="business-systems-visual__ambient" aria-hidden="true" />

      <svg
        className="business-systems-visual__map"
        viewBox="0 0 360 410"
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
            <stop offset="0%" stopColor="#6344F5" />
            <stop offset="48%" stopColor="#24CCFF" />
            <stop offset="100%" stopColor="#52E5A0" />
          </linearGradient>
          <radialGradient id="business-system-core" cx="50%" cy="42%" r="66%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
            <stop offset="62%" stopColor="#ffffff" stopOpacity="0.74" />
            <stop offset="100%" stopColor="#6344F5" stopOpacity="0.18" />
          </radialGradient>
        </defs>

        <circle
          className="business-systems-visual__orbit business-systems-visual__motion"
          cx="180"
          cy="204"
          r="112"
        />
        <circle
          className="business-systems-visual__orbit business-systems-visual__orbit--inner business-systems-visual__motion"
          cx="180"
          cy="204"
          r="78"
        />

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

        <g className="business-systems-visual__satellites business-systems-visual__motion">
          <circle cx="180" cy="92" r="4" />
          <circle cx="292" cy="204" r="4" />
          <circle cx="180" cy="316" r="4" />
          <circle cx="68" cy="204" r="4" />
        </g>

        {SYSTEM_NODES.map((node) => (
          <g
            className="business-systems-visual__node business-systems-visual__motion"
            key={node.id}
            transform={`translate(${node.x} ${node.y})`}
            style={{ "--node-delay": node.delay }}
          >
            <circle className="business-systems-visual__node-ring" r="23" />
            <circle className="business-systems-visual__node-surface" r="18" />
            <circle className="business-systems-visual__node-signal" r="4" />
            <text textAnchor="middle" y="38">
              {node.label}
            </text>
          </g>
        ))}

        <g className="business-systems-visual__core">
          <circle
            className="business-systems-visual__core-halo business-systems-visual__motion"
            cx="180"
            cy="204"
            r="55"
          />
          <circle
            className="business-systems-visual__core-surface"
            cx="180"
            cy="204"
            r="46"
          />
          <text
            className="business-systems-visual__core-kicker"
            x="180"
            y="195"
            textAnchor="middle"
          >
            BUILT AROUND
          </text>
          <text
            className="business-systems-visual__core-title"
            x="180"
            y="214"
            textAnchor="middle"
          >
            YOUR BUSINESS
          </text>
          <path
            className="business-systems-visual__core-rule"
            d="M150 224 H210"
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
