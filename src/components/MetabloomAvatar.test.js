import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
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
      "data-palette": props.metabloomPalette,
      "data-paused": String(props.paused),
      "data-pulse-version": String(props.externalPulseVersion),
    });
  };
});

describe("MetabloomAvatar", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFieldProps = null;
    mockFieldRenderCount = 0;
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("uses the exact CreatorOS Metabloom field as one faceless body", () => {
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
    expect(avatar).toHaveAttribute("data-avatar-faceless", "true");
    expect(avatar).toHaveAttribute("data-avatar-action", "disagree");
    expect(mockFieldProps).toMatchObject({
      externalPulseVersion: 7,
      metabloomPalette: "spectral",
      mode: 0,
      paused: false,
    });
    expect(avatar.querySelector("svg")).not.toBeInTheDocument();
    expect(avatar.querySelector(".metabloom-avatar__face")).not.toBeInTheDocument();
    expect(avatar.querySelector(".metabloom-avatar__eye")).not.toBeInTheDocument();
    expect(avatar.querySelector(".metabloom-avatar__mouth")).not.toBeInTheDocument();
  });

  test("changes gesture and chameleon colorway without mounting another renderer", () => {
    const { rerender } = render(
      <MetabloomAvatar action="agree" actionVersion={1} />,
    );

    const avatar = screen.getByTestId("metabloom-avatar");
    const firstField = screen.getByTestId("creatoros-metabloom-field");
    expect(avatar).toHaveAttribute("data-avatar-action", "agree");
    expect(avatar).toHaveAttribute("data-avatar-colorway", "Verdant signal");
    expect(
      avatar.querySelector(".metabloom-avatar__motion"),
    ).toHaveClass("is-acting");

    rerender(<MetabloomAvatar action="excited" actionVersion={2} />);

    expect(avatar).toHaveAttribute("data-avatar-action", "excited");
    expect(avatar).toHaveAttribute("data-avatar-colorway", "Electric bloom");
    expect(screen.getAllByTestId("creatoros-metabloom-field")).toHaveLength(1);
    expect(screen.getByTestId("creatoros-metabloom-field")).toBe(firstField);
    expect(mockFieldRenderCount).toBeGreaterThan(1);
  });

  test("replays the same action when its bounded version changes", () => {
    const { rerender } = render(
      <MetabloomAvatar action="agree" actionVersion={1} />,
    );
    const motion = document.querySelector(".metabloom-avatar__motion");
    expect(motion).toHaveClass("is-acting");

    act(() => {
      jest.advanceTimersByTime(920);
    });
    expect(motion).not.toHaveClass("is-acting");

    rerender(<MetabloomAvatar action="agree" actionVersion={2} />);
    expect(motion).toHaveClass("is-acting");
  });

  test("pauses the shared field when inactive or explicitly paused", () => {
    const { rerender } = render(
      <MetabloomAvatar isActive={false} paused={false} />,
    );

    expect(mockFieldProps.paused).toBe(true);
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-avatar-active",
      "false",
    );

    rerender(<MetabloomAvatar isActive paused />);
    expect(mockFieldProps.paused).toBe(true);

    rerender(<MetabloomAvatar isActive paused={false} />);
    expect(mockFieldProps.paused).toBe(false);
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-avatar-active",
      "true",
    );
  });

  test("keeps keyboard and pointer pulse activation on the amorphous body", () => {
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

  test("normalizes legacy action names into the new vocabulary", () => {
    render(<MetabloomAvatar action="curious" />);
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-avatar-action",
      "thinking",
    );
  });
});
