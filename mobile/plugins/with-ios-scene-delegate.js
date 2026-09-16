const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

// Apps linked with the iOS 27 SDK must adopt the UIScene lifecycle. The Expo
// SDK 54 template still creates its UIWindow in AppDelegate, so UIKit traps at
// launch on iOS 27. Start React Native from the connected UIWindowScene and
// keep AppDelegate.window synchronized for React Native APIs that still read it.
const MARKER = "// hungrie-ios-scene-delegate";

const SCENE_DELEGATE = `
${MARKER}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)

    // Scene-based cold starts deliver links through connectionOptions.
    for context in connectionOptions.urlContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
    for activity in connectionOptions.userActivities {
      RCTLinkingManager.application(
        UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

const WINDOW_RE = /^[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)\r?\n/m;
const START_RN_RE =
  /^[ \t]*factory\.startReactNative\(\r?\n[\s\S]*?launchOptions: launchOptions\)\r?\n/m;

const NEW_WINDOW_LINE = `    // UIWindow creation and React Native startup moved to SceneDelegate.
    self.launchOptions = launchOptions
`;

const withSceneAppDelegate = (config) =>
  withAppDelegate(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) return cfg;

    for (const [pattern, description] of [
      [WINDOW_RE, "window creation"],
      [START_RN_RE, "React Native startup"],
    ]) {
      if (!pattern.test(contents)) {
        throw new Error(
          `with-ios-scene-delegate: Expo AppDelegate template is missing ${description}`,
        );
      }
    }

    contents = contents
      .replace(WINDOW_RE, NEW_WINDOW_LINE)
      .replace(START_RN_RE, "");

    const windowAnchor = "  var window: UIWindow?\n";
    if (!contents.includes(windowAnchor)) {
      throw new Error("with-ios-scene-delegate: AppDelegate window property was not found");
    }
    contents = contents.replace(
      windowAnchor,
      `${windowAnchor}  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n`,
    );

    cfg.modResults.contents = contents + SCENE_DELEGATE;
    return cfg;
  });

const withSceneManifest = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return cfg;
  });

module.exports = (config) => withSceneManifest(withSceneAppDelegate(config));
