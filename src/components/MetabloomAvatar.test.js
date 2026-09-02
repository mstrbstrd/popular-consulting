import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MetabloomAvatar from "./MetabloomAvatar";

let mockFieldProps = null;

jest.mock("../utils/deviceTier", () => ({
  hasHardwareWebGL: true,
}));

jest.mock("./CreatorOSFieldCanvas", () => {
  const ReactModule = require("react");
  return (props) => {
    mockFieldProps = props;
    return ReactModule.createElement("div", {
      "data-testid": "metabloom-material-field",
      "data-mode": String(props.mode),
      "data-palette": props.metabloomPalette,
      "data-paused": String(props.paused),
    });
  };
});

describe("MetabloomAvatar", () => {
  beforeEach(() => {
    mockFieldProps = null;
    window.requestAnimationFrame = jest.fn((callback) => {
      callback(0);
      return 1;
    });
    window.cancelAnimationFrame = jest.fn();
  });

  afterEach(() => {
    cleanup();
  });

  test("builds every avatar form from one bounded Metabloom field", () => {
    const { rerender } = render(
      <MetabloomAvatar expression="happy" form="companion" />,
    );

    expect(screen.getAllByTestId("metabloom-material-field")).toHaveLength(1);
    expect(screen.getByTestId("metabloom-material-field")).toHaveAttribute(
      "data-mode",
      "0",
    );
    expect(screen.getByTestId("metabloom-material-field")).toHaveAttribute(
      "data-palette",
      "spectral",
    );

    rerender(<MetabloomAvatar expression="thinking" form="focus" />);

    expect(screen.getAllByTestId("metabloom-material-field")).toHaveLength(1);
    expect(screen.getByTestId("metabloom-material-field")).toHaveAttribute(
      "data-palette",
      "metalbloom",
    );
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-avatar-form",
      "focus",
    );
  });

  test("pauses the field when the avatar is inactive or explicitly paused", () => {
    const { rerender } = render(
      <MetabloomAvatar isActive={false} paused={false} />,
    );

    expect(mockFieldProps.paused).toBe(true);
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-avatar-active",
      "false",
    );

    rerender(<MetabloomAvatar isActive={true} paused={true} />);
    expect(mockFieldProps.paused).toBe(true);

    rerender(<MetabloomAvatar isActive={true} paused={false} />);
    expect(mockFieldProps.paused).toBe(false);
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-avatar-active",
      "true",
    );
  });

  test("renders expressive face states without changing renderer ownership", () => {
    const { rerender } = render(
      <MetabloomAvatar expression="sad" form="drift" talking={false} />,
    );

    const avatar = screen.getByTestId("metabloom-avatar");
    expect(avatar).toHaveAttribute("data-avatar-expression", "sad");
    expect(avatar).toHaveAttribute("data-avatar-form", "drift");
    expect(avatar.querySelector(".metabloom-avatar__tear")).toBeInTheDocument();

    rerender(
      <MetabloomAvatar expression="happy" form="bloom" talking />,
    );

    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-avatar-talking",
      "true",
    );
    expect(
      screen
        .getByTestId("metabloom-avatar")
        .querySelector(".metabloom-avatar__talking-mouth"),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("metabloom-material-field")).toHaveLength(1);
  });

  test("supports keyboard and pointer pulse activation", () => {
    const onPulse = jest.fn();
    render(<MetabloomAvatar onPulse={onPulse} />);

    const avatar = screen.getByRole("button", {
      name: /activate to send a pulse through the material/i,
    });
    fireEvent.keyDown(avatar, { key: "Enter" });
    fireEvent.keyDown(avatar, { key: " " });
    fireEvent.click(avatar);

    expect(onPulse).toHaveBeenCalledTimes(3);
  });
});
