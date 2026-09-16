const { withPodfile } = require("expo/config-plugins");

const MARKER = "# Hungrie: Xcode 27 minimum deployment target";

/**
 * Xcode 27 cannot build targets below iOS 15. Some transitive pods still
 * declare older targets, so raise only those generated pod targets during
 * CocoaPods installation. This runs after every managed prebuild, including
 * EAS local builds where ios/ is regenerated.
 */
module.exports = function withIos15Pods(config) {
  return withPodfile(config, (podfileConfig) => {
    if (podfileConfig.modResults.contents.includes(MARKER)) {
      return podfileConfig;
    }

    const closingPostInstall = /^  end$/m;
    const postInstallStart = podfileConfig.modResults.contents.indexOf("  post_install do |installer|");
    if (postInstallStart < 0) {
      throw new Error("Could not find the CocoaPods post_install block.");
    }

    const remainder = podfileConfig.modResults.contents.slice(postInstallStart);
    const closingMatch = closingPostInstall.exec(remainder);
    if (!closingMatch) {
      throw new Error("Could not find the end of the CocoaPods post_install block.");
    }

    const insertionIndex = postInstallStart + closingMatch.index;
    const override = [
      `    ${MARKER}`,
      "    installer.pods_project.targets.each do |pod_target|",
      "      pod_target.build_configurations.each do |build_configuration|",
      "        configured_target = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']",
      "        if configured_target.nil? || Gem::Version.new(configured_target) < Gem::Version.new('15.1')",
      "          build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'",
      "        end",
      "      end",
      "    end",
      "",
    ].join("\n");

    podfileConfig.modResults.contents =
      podfileConfig.modResults.contents.slice(0, insertionIndex) +
      override +
      podfileConfig.modResults.contents.slice(insertionIndex);
    return podfileConfig;
  });
};
