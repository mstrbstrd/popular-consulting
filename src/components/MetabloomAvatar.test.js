import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MetabloomPaletteContext from "../contexts/MetabloomPaletteContext";
import MetabloomAvatar from "./MetabloomAvatar";

let mockFieldProps = null;
let mockFieldRenderCount = 0;

jest.mock("./CreatorOSFieldCanvas", () => {
  const ReactModule = require("react");
  return (props) => {
    mockFieldProps = props;
    mockFieldRenderCount += 1;
    return ReactModule.createElement("div", {
      "data-testid": "creatoros-metabloom-field",
      "data-mode": String(props.mode),
      "data-avatar-enabled": String(props.metabloomAvatarEnabled),
      "data-avatar-action": String(props.metabloomAvatarAction),
      "data-palette": props.metabloomPalette,
      "data-paused": String(props.paused),
    });
  };
});

describe("MetabloomAvatar", () => {
  beforeEach(() => {
    mockFieldProps = null;
    mockFieldRenderCount = 0;
  });

  afterEach(() => {
    cleanup();
  });

  test("uses the CreatorOS Metabloom field itself as the only visible body", () => {
    render(
      <MetabloomAvatar
        action="disagree"
        actionVersion={3}
        pulseVersion={7}
      />,
    );

    const avatar = screen.getByTestId("metabloom-avatar");
    expect(screen.getAllByTestId("creatoros-metabloom-field")).toHaveLength(1);
    expect(avatar).toHaveAttribute(
      "data-avatar-material",
      "creatoros-metabloom",
    );
    expect(avatar).toHaveAttribute("data-avatar-engine", "intrinsic-shader");
    expect(avatar).toHaveAttribute("data-avatar-faceless", "true");
    expect(avatar).toHaveAttribute("data-avatar-action", "disagree");
    expect(avatar).toHaveAttribute("data-avatar-finish", "spectral");
    expect(mockFieldProps).toMatchObject({
      externalPulseVersion: 7,
      metabloomAvatarAction: 2,
      metabloomAvatarColorA: "#ff315f",
      metabloomAvatarColorB: "#ff36d1",
      metabloomAvatarColorC: "#7138ff",
      metabloomAvatarDuration: 820,
      metabloomAvatarEnabled: true,
      metabloomAvatarIntensity: 0.54,
      metabloomAvatarTalking: false,
      metabloomAvatarVersion: 3,
      metabloomPalette: "spectral",
      mode: 0,
      paused: false,
    });

    [
      ".metabloom-avatar__blob",
      ".metabloom-avatar__motion",
      ".metabloom-avatar__pose",
      ".metabloom-avatar__colorwash",
      ".metabloom-avatar__burst",
      ".metabloom-avatar__fragment",
      ".metabloom-avatar__face",
    ].forEach((selector) => {
      expect(avatar.querySelector(selector)).not.toBeInTheDocument();
    });
  });

  test("changes intrinsic action uniforms without mounting another renderer", () => {
    const { rerender } = render(
      <MetabloomAvatar action="agree" actionVersion={1} />,
    );

    const avatar = screen.getByTestId("metabloom-avatar");
    const firstField = screen.getByTestId("creatoros-metabloom-field");
    expect(mockFieldProps.metabloomAvatarAction).toBe(1);
    expect(mockFieldProps.metabloomAvatarVersion).toBe(1);

    rerender(<MetabloomAvatar action="excited" actionVersion={2} />);

    expect(avatar).toHaveAttribute("data-avatar-action", "excited");
    expect(mockFieldProps.metabloomAvatarAction).toBe(4);
    expect(mockFieldProps.metabloomAvatarVersion).toBe(2);
    expect(screen.getAllByTestId("creatoros-metabloom-field")).toHaveLength(1);
    expect(screen.getByTestId("creatoros-metabloom-field")).toBe(firstField);
    expect(mockFieldRenderCount).toBeGreaterThan(1);
  });

  test("changes material uniforms without remounting the field renderer", () => {
    const { rerender } = render(
      <MetabloomPaletteContext.Provider value="spectral">
        <MetabloomAvatar action="reform" />
      </MetabloomPaletteContext.Provider>,
    );

    const firstField = screen.getByTestId("creatoros-metabloom-field");
    expect(firstField).toHaveAttribute("data-palette", "spectral");
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-avatar-finish",
      "spectral",
    );

    rerender(
      <MetabloomPaletteContext.Provider value="metalbloom">
        <MetabloomAvatar action="reform" />
      </MetabloomPaletteContext.Provider>,
    );

    expect(screen.getByTestId("creatoros-metabloom-field")).toBe(firstField);
    expect(screen.getByTestId("creatoros-metabloom-field")).toHaveAttribute(
      "data-palette",
      "metalbloom",
    );
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-avatar-finish",
      "metalbloom",
    );
    expect(mockFieldProps.metabloomPalette).toBe("metalbloom");
  });

  test("forwards talking and pause into the same field renderer", () => {
    const { rerender } = render(
      <MetabloomAvatar isActive talking paused={false} />,
    );

    expect(mockFieldProps.metabloomAvatarTalking).toBe(true);
    expect(mockFieldProps.paused).toBe(false);

    rerender(<MetabloomAvatar isActive talking={false} paused />);
    expect(mockFieldProps.metabloomAvatarTalking).toBe(false);
    expect(mockFieldProps.paused).toBe(true);

    rerender(<MetabloomAvatar isActive={false} paused={false} />);
    expect(mockFieldProps.paused).toBe(true);
  });

  test("keeps keyboard and pointer pulse activation on the live field", () => {
    const onPulse = jest.fn();
    render(<MetabloomAvatar onPulse={onPulse} />);

    const avatar = screen.getByRole("button", {
      name: /activate to send a pulse through it/i,
    });
    fireEvent.keyDown(avatar, { key: "Enter" });
    fireEvent.keyDown(avatar, { key: " " });
    fireEvent.click(avatar);

    expect(onPulse).toHaveBeenCalledTimes(3);
  });

  test("normalizes legacy action names into the shader vocabulary", () => {
    render(<MetabloomAvatar action="curious" />);
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-avatar-action",
      "thinking",
    );
    expect(mockFieldProps.metabloomAvatarAction).toBe(7);
  });
});
