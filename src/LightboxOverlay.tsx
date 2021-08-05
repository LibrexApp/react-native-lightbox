import React, { useRef, useEffect } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  StyleSheet,
  PanResponderInstance,
  StatusBar,
  TouchableOpacity,
  Text,
  Modal,
} from "react-native";
import { useAsyncSetState } from "./use-async-state";

import { LightboxProps, IOrigin, ISpringConfig } from "./Lightbox";

type OmitedLightboxProps = Omit<
  LightboxProps,
  "style" | "disabled" | "underlayColor" | "activeProps" | "renderContent"
>;

export interface LightboxOverlayProps extends OmitedLightboxProps {
  isOpen?: boolean;
  origin?: IOrigin;
  springConfig?: ISpringConfig;
}

const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get("window");
const isIOS = Platform.OS === "ios";
const getDefaultTarget = () => ({ x: 0, y: 0, opacity: 1 });

const styles = StyleSheet.create({
  background: {
    position: "absolute",
    top: 0,
    left: 0,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  },
  open: {
    position: "absolute",
    flex: 1,
    justifyContent: "center",
    // Android pan handlers crash without this declaration:
    backgroundColor: "transparent",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    width: WINDOW_WIDTH,
    backgroundColor: "transparent",
  },
  closeButton: {
    fontSize: 35,
    color: "white",
    lineHeight: 60,
    width: 70,
    textAlign: "center",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowRadius: 1.5,
    shadowColor: "black",
    shadowOpacity: 0.8,
  },
});

const LightboxOverlay: React.FC<LightboxOverlayProps> = ({
  useNativeDriver,
  dragDismissThreshold,
  springConfig,
  isOpen,
  onClose,
  willClose,
  didOpen,
  swipeToDismiss,
  origin,
  backgroundColor,
  renderHeader,
  modalProps,
  children,
}) => {
  const _panResponder = useRef<PanResponderInstance>();
  const pan = useRef(new Animated.Value(0));
  const openVal = useRef(new Animated.Value(0));

  const [{ isAnimating, isPanning, target }, setStateAsync] = useAsyncSetState({
    isAnimating: false,
    isPanning: false,
    target: getDefaultTarget(),
  });

  const close = async () => {
    willClose!();
    if (isIOS) {
      StatusBar.setHidden(false, "fade");
    }

    await setStateAsync((s) => ({
      ...s,
      isAnimating: true,
    }));

    Animated.spring(openVal.current, {
      toValue: 0,
      ...springConfig,
      useNativeDriver,
    }).start(() => {
      (async () => {
        await setStateAsync((s) => ({ ...s, isAnimating: false }));
        onClose!();
      })();
    });
  };

  const open = async () => {
    if (isIOS) {
      StatusBar.setHidden(true, "fade");
    }

    pan.current.setValue(0);

    await setStateAsync((s) => ({
      ...s,
      isAnimating: true,
      target: getDefaultTarget(),
    }));

    Animated.spring(openVal.current, {
      toValue: 1,
      ...springConfig,
      useNativeDriver,
    }).start(() => {
      (async () => {
        await setStateAsync((s) => ({ ...s, isAnimating: false }));
        didOpen!();
      })();
    });
  };

  const initPanResponder = async () => {
    _panResponder.current = PanResponder.create({
      // Ask to be the responder:
      onStartShouldSetPanResponder: () => !isAnimating,
      onStartShouldSetPanResponderCapture: () => !isAnimating,
      onMoveShouldSetPanResponder: () => !isAnimating,
      onMoveShouldSetPanResponderCapture: () => !isAnimating,

      onPanResponderGrant: () => {
        pan.current.setValue(0);
        (async () => {
          await setStateAsync((s) => ({ ...s, isPanning: true }));
        })();
      },

      onPanResponderMove: Animated.event([null, { dy: pan.current }], {
        useNativeDriver,
      }),
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (evt, gestureState) => {
        if (Math.abs(gestureState.dy) > dragDismissThreshold!) {
          (async () => {
            await setStateAsync((s) => ({
              ...s,
              isPanning: false,
              target: {
                y: gestureState.dy,
                x: gestureState.dx,
                opacity: 1 - Math.abs(gestureState.dy / WINDOW_HEIGHT),
              },
            }));
            close();
          })();
        } else {
          Animated.spring(pan.current, {
            toValue: 0,
            ...springConfig,
            useNativeDriver,
          }).start(() => {
            (async () => {
              await setStateAsync((s) => ({ ...s, isPanning: false }));
            })();
          });
        }
      },
    });
  };

  useEffect(() => {
    initPanResponder();
  }, [useNativeDriver]);

  useEffect(() => {
    isOpen && open();
  }, [isOpen]);

  const lightboxOpacityStyle = {
    opacity: openVal.current.interpolate({
      inputRange: [0, 1],
      outputRange: [0, target.opacity],
    }),
  };

  let handlers;
  if (swipeToDismiss && _panResponder.current) {
    handlers = _panResponder.current.panHandlers;
  }

  let dragStyle;
  if (isPanning) {
    dragStyle = {
      top: pan.current,
    };
    lightboxOpacityStyle.opacity = pan.current.interpolate({
      inputRange: [-WINDOW_HEIGHT, 0, WINDOW_HEIGHT],
      outputRange: [0, 1, 0],
    });
  }

  const getOpenStyle = () => [
    styles.open,
    {
      left: openVal.current.interpolate({
        inputRange: [0, 1],
        outputRange: [origin!.x, target.x],
      }),
      top: openVal.current.interpolate({
        inputRange: [0, 1],
        outputRange: [origin!.y, target.y],
      }),
      width: openVal.current.interpolate({
        inputRange: [0, 1],
        outputRange: [origin!.width, WINDOW_WIDTH],
      }),
      height: openVal.current.interpolate({
        inputRange: [0, 1],
        outputRange: [origin!.height, WINDOW_HEIGHT],
      }),
    },
  ];

  const background = (
    <Animated.View
      style={[styles.background, { backgroundColor }, lightboxOpacityStyle]}
    ></Animated.View>
  );

  const header = (
    <Animated.View style={[styles.header, lightboxOpacityStyle]}>
      {renderHeader ? (
        renderHeader(close)
      ) : (
        <TouchableOpacity onPress={close}>
          <Text style={styles.closeButton}>×</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );

  const content = (
    <Animated.View style={[getOpenStyle(), dragStyle]} {...handlers}>
      {children}
    </Animated.View>
  );

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      onRequestClose={close}
      {...modalProps}
    >
      {background}
      {content}
      {header}
    </Modal>
  );
};

export default LightboxOverlay;