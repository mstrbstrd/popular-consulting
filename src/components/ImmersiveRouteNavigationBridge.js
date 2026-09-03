import React from "react";

const ROUTE_DESTINATIONS = Object.freeze([
  "/",
  "/#section-1",
  "/#section-2",
  "/#section-3",
  "/orb",
]);

export const getImmersiveRouteDestination = (sectionIndex) =>
  ROUTE_DESTINATIONS[sectionIndex] || ROUTE_DESTINATIONS[0];

const defaultNavigate = (href) => window.location.assign(href);

const ImmersiveRouteNavigationBridge = ({
  navigate = defaultNavigate,
}) => {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const readyTimer = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(readyTimer);
  }, []);

  return (
    <div
      aria-hidden="true"
      data-route-navigation-bridge="immersive-sections"
      hidden
    >
      {ROUTE_DESTINATIONS.map((href, sectionIndex) => (
        <button
          key={href}
          type="button"
          tabIndex={-1}
          aria-label={`Route to section ${sectionIndex}`}
          className={`section-dot${
            ready && sectionIndex === ROUTE_DESTINATIONS.length - 1
              ? " active"
              : ""
          }`}
          onClick={() => navigate(getImmersiveRouteDestination(sectionIndex))}
        />
      ))}
    </div>
  );
};

export default ImmersiveRouteNavigationBridge;
