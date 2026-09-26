#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DIAGNOSTIC_OPERATOR,
  REJECTED_DEPLOYMENTS,
  validateAuthority,
  verifyProtectedEvidence,
  verifyRollbackParity,
  validateRollbackReference as validateDeploymentRollbackReference,
  requireMaintenanceWindow,
} from "./deploy-restaurant-alias-10-minute-diagnostic-staging.mjs";
import { sanitizeError } from "./restaurant-alias-parity-verifier.mjs";
import { verifyReadOnlyEasExportEvidence } from "./verify-restaurant-alias-production-export-readiness.mjs";

export const SUPPORT = Object.freeze({
  historicalApplicationTree: "ae03238ac8c34f4ef11365b5a5c51dee81187812",
  proposalPath: "docs/restaurant-expo-alias-ruip6ad-20260926j-run-binding-contract.md",
  proposalSha256: "ecc346f1738bfb048e64e9281a1ac53270c92d00fe09e72614e470fc57a29b53",
  baseCheckpoint: "a1cf25b443441d424259af2568ced55b00d5560a",
  baseSourceManifestSha256: "a2e022bdbbc494f9125c23b7f72cc784a4a37a0ac8d3f1e897388e24bc81e052",
  baseSourceManifestFiles: 1536,
  checkpointFiles: Object.freeze([
    "apps/restaurant/metro.config.js",
    "apps/restaurant/scripts/deterministic-metro-module-ids.cjs",
    "apps/restaurant/scripts/deterministic-metro-module-map.json",
    "docs/restaurant-expo-alias-deterministic-metro-evidence/candidate-artifact-manifest.json",
    "docs/restaurant-expo-alias-deterministic-metro-evidence/complete-artifact-comparison.json",
    "docs/restaurant-expo-alias-deterministic-metro-evidence/evidence-manifest.tsv",
    "docs/restaurant-expo-alias-deterministic-metro-evidence/restaurant-static-export.tar",
    "docs/restaurant-expo-alias-deterministic-metro-export-remediation-review.md",
    "docs/restaurant-expo-alias-ruip6ad-20260926j-run-binding-contract.md",
    "scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs",
    "scripts/restaurant-alias-diagnostic-execution-support.mjs",
    "scripts/test-restaurant-alias-diagnostic-execution-support.mjs",
    "scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs",
    "scripts/test-restaurant-alias-read-only-eas-export-readiness.mjs",
    "scripts/test-restaurant-deterministic-metro-module-ids.mjs",
    "scripts/verify-restaurant-alias-production-export-readiness.mjs",
  ]),
  acceptedLineage: Object.freeze([
    Object.freeze({
      commit: "1a64f4ddd59114af9ad8d7968bfdc9729f2f0e92",
      parent: "267b9bc5bbe888431d864963890f73c7092ededc",
      sourceManifestSha256: "8449af0cf852d22154392525d1e2cca5c78461036667065f1f9ec4662c85e059",
      sourceManifestFiles: 1494,
      files: Object.freeze({
        "docs/restaurant-alias-diagnostic-execution-support-implementation-review.md": "acbdcdb95d2da5f7e1753fa028996526805e7c6c58adb1114f944adc7126925d",
        "docs/restaurant-alias-diagnostic-execution-support-implementation.diff": "b1c271d712a5ae58e7b889dc6349e31787fe4cfd531d54272c1ef541665c48e6",
        "scripts/restaurant-alias-diagnostic-execution-support.mjs": "b8e0671db93c4d8b1adc2a58844d495cb0b42c46931372f84b859017b6682bb4",
        "scripts/test-restaurant-alias-diagnostic-execution-support.mjs": "11e8eb1c41b808004fb0aa7541bfc18b4e029604231feb8c5c7628e7d94c38ad",
      }),
    }),
    Object.freeze({
      commit: "c3180f019de93fae99341628577a9553faad60f7",
      parent: "1a64f4ddd59114af9ad8d7968bfdc9729f2f0e92",
      sourceManifestSha256: "89709da5fb1609b706fae69d41a200dd6914415f65a2ae31007806141a86c12b",
      sourceManifestFiles: 1496,
      files: Object.freeze({
        "docs/restaurant-alias-diagnostic-execution-support-implementation-review.md": "04bd00d8810e3650cc7f772608d2363e430181f43fdd980ba59013818a94a4b5",
        "docs/restaurant-alias-diagnostic-execution-support-implementation.diff": "20d2fde68d417b48e329c239a983ac9cb6b5aff032f36dd92c95855c030e3dd5",
        "docs/restaurant-expo-alias-final-one-run-operational-readiness-audit.md": "ebc82cb266998699989a6a8ce1900ee4ed47d9dfbb729060a8df63cb2a215819",
        "docs/restaurant-expo-alias-final-one-run-staging-execution-authorization-proposal.md": "9cf30053110f0380c09e297a645834d4ac9f020dd4214aa68b97ce9ab7103b41",
        "scripts/restaurant-alias-diagnostic-execution-support.mjs": "b7374024b74f28e2dedd157e2de25b2a5368fd43484aa8528c6ed7d2ea6ceae5",
        "scripts/test-restaurant-alias-diagnostic-execution-support.mjs": "84cf80869b12195d90192fcf46e2821574abeb4b02a9ae32e9b17eef5d4925c5",
      }),
    }),
    Object.freeze({
      commit: "583579463f339dd8178917ebaa5e5cae9347dc5c",
      parent: "c3180f019de93fae99341628577a9553faad60f7",
      sourceManifestSha256: "fc3e6b5b6b4340bc7da310d2ef9bfca5514cc21756ae4c85db05cde0cf619c22",
      sourceManifestFiles: 1501,
      files: Object.freeze({
        "docs/restaurant-staging-four-account-preparation-implementation-review.md": "fa1f765d4fdbdd4141e5f009f0616b5adab81c5e99f172bc94c67753e77ec221",
        "docs/restaurant-staging-four-account-preparation-implementation.diff": "47e3dbcd9dd0c3aeb3973a009a80823e423545432ae19e3087be5ea45a219032",
        "scripts/restaurant-staging-account-preparation.mjs": "39d9ccd615b644715fe33337a9b60e6f7227d2207a0c7ada605a181bdb51105a",
        "scripts/test-restaurant-staging-account-preparation-postgres.mjs": "5ac0d5049440750444b983d3b8f6c07b5edfd4d5f6153bee4b302ec10c68171b",
        "scripts/test-restaurant-staging-account-preparation.mjs": "8e4e96a7d9131b77f65e32b4619ed7b573ff73f8c190a33f546126b39d608f85",
      }),
    }),
    Object.freeze({
      commit: "47104d426b3eb36486956f1de1db0aa5e6616393",
      parent: "583579463f339dd8178917ebaa5e5cae9347dc5c",
      sourceManifestSha256: "dbdb7cb8d08c6f0a69397bb7846ade1fad06661950c218c774cf9cb3311d772a",
      sourceManifestFiles: 1504,
      files: Object.freeze({
        "docs/restaurant-expo-alias-checkpoint-binding-compatibility-implementation-review.md": "f25929bbae56487bdb4afabbe6b481ecbb090114ef7a0ff5fe08f20a04d3e07e",
        "docs/restaurant-expo-alias-checkpoint-binding-compatibility-implementation.diff": "66bf47fb8023269cb79ffb90d594232131e242540f4a4d737af6e53ae6ee7494",
        "docs/restaurant-expo-alias-final-execution-readiness-handoff.md": "c04c9e6d0ad7e4cdd0678451c525ee527ca2fece139237c66ace832936a20b4c",
        "docs/restaurant-expo-alias-final-one-run-staging-execution-authorization-proposal.md": "e19442464a445c044d7cfd4212718edfd016b1af67f8f44aedeb6c399f72ef70",
        "scripts/restaurant-alias-diagnostic-execution-support.mjs": "fc70479e57b94fa3640966c105b71e175cd1c193c60fc3dd3fd0cb8dc445fa82",
        "scripts/test-restaurant-alias-diagnostic-execution-support.mjs": "b0737ddf8017170ad6cb246e87502a3f367651627bedea6d01a563b77056aa1b",
      }),
    }),
    Object.freeze({
      commit: "5533606a841e9a7d75b2a3e22ef672bd107fa5d8",
      parent: "47104d426b3eb36486956f1de1db0aa5e6616393",
      sourceManifestSha256: "f06613f65c5a8866fe914dcd80efd8b04ef53e734aa27c651c445498cf739fc6",
      sourceManifestFiles: 1506,
      files: Object.freeze({
        "docs/restaurant-expo-alias-final-execution-readiness-handoff.md": "899c55b1ab3636b871452dfbc3b835382709415922827f66537c398334fc2e7c",
        "docs/restaurant-expo-alias-final-one-run-staging-execution-authorization-proposal.md": "4f07c54d1b6291a3272b242324c3e24eb02b62c84d8cd906b31f1b110fd880d4",
        "docs/restaurant-expo-alias-supabase-http201-compatibility-implementation-review.md": "e29192433ee6fc19da9d89cc188689c0006140d0cca6bf02b5bbe87e60a1cd26",
        "docs/restaurant-expo-alias-supabase-http201-compatibility-implementation.diff": "bb251ba1bc45c9803323acba6c7e4c0c4924c34f336092a05a32cc8d91cc02a7",
        "scripts/restaurant-alias-diagnostic-execution-support.mjs": "8be9d0bce40799f3aa9a75539044959eaa0b6a024e5b7f37c3689c75e539eaf9",
        "scripts/test-restaurant-alias-diagnostic-execution-support.mjs": "fbd3c3af540fd2432eb247b3202a19ed1dfe44e6354dde3e9eef6f2549ecb126",
      }),
    }),
    Object.freeze({
      commit: "0612be3f72ff3792321c74cfad6540900fa3a4c2",
      parent: "5533606a841e9a7d75b2a3e22ef672bd107fa5d8",
      sourceManifestSha256: "609c232f6ffe5d3a551af07ea9e8070c06fafb866c34e9e54a5d3da72b074dc0",
      sourceManifestFiles: 1511,
      files: Object.freeze({
        "docs/restaurant-expo-alias-diagnostic-remediated-execution-contract.md": "06f1d1862a82c4d8d225b08e6a06ceee4590b59b1ae2bdaaa44d73838df0799f",
        "docs/restaurant-expo-alias-diagnostic-remediation-implementation-review.md": "fa024bb9c5b8e8abd0322676ca8509d47c0cd27ceaa386797727031e7d303571",
        "docs/restaurant-expo-alias-diagnostic-remediation-implementation.diff": "4d527e9920cc5b3e41178498547ed6d04984009ed17851619ca2a377df3e8506",
        "docs/restaurant-expo-alias-ruip6ad-20260925c-execution-contract.md": "1d89925353d88af8f278fb6b6aa2bf6e0cb4e133bd6d178409b8340430b4b6f5",
        "scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs": "cf0e10538f0922f8e13236fa9eaee9947d83cf4e2c838cee1d1d1f0b54858b53",
        "scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs": "2e0189fca16b9bbd6a95d87685d38e92b8260f75e6a8225bed5221c3492c3c7d",
        "scripts/restaurant-alias-diagnostic-execution-support.mjs": "b76e106ed855d135dfc7339f7d4e213a15aa7aea04ebb9c405ffadaa9050c1a2",
        "scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs": "2392f2e9f96e9d6a40787775724f42537a9a0c34bb0f8644c23d0e4faeed349f",
        "scripts/test-restaurant-alias-diagnostic-access-staging.mjs": "860e4b0589133bc7d452126e7652af6866b3ce7685db104b2c919e3fa9c76ee6",
        "scripts/test-restaurant-alias-diagnostic-execution-support.mjs": "e7d848771145619d1cc3648388b48757a7165af9346ea02bb0911aaca92a51c6",
      }),
    }),
    Object.freeze({
      commit: "0fef9c48fdf976ad860f1bd587af4334c926cd91",
      parent: "0612be3f72ff3792321c74cfad6540900fa3a4c2",
      sourceManifestSha256: "b86fa4c5b37f68d72a4e81c38db468fbe5720bf39be533ac637a02a01686ea09",
      sourceManifestFiles: 1518,
      files: Object.freeze({
        "docs/restaurant-expo-alias-artifact-identity-remediation-review.md": "3e3267ddae32eca15abcc7bd77c41f6ce0454317f221e89d39f6424379a5d5f3",
        "docs/restaurant-expo-alias-artifact-identity-remediation.diff": "38b8c3b031524bce934d4f9b8dd1fd2d773c039010dfa2ace76baa1508f313ed",
        "docs/restaurant-expo-alias-artifact-remediation-evidence/candidate-artifact-manifest.json": "9d128ecb166be831d0ef7eb103d6b1e5c95c765abcd7d9e92b28ca1494b3f90e",
        "docs/restaurant-expo-alias-artifact-remediation-evidence/complete-artifact-comparison.json": "01a5f4a688f915d1e6857cf975dff50d9ed33ef0c6789d113b41b451de0e0aa7",
        "docs/restaurant-expo-alias-artifact-remediation-evidence/evidence-manifest.tsv": "773a808c43e83f6a70472d05c05ed05140ae35d55766d3a034e88f13f9870290",
        "docs/restaurant-expo-alias-artifact-remediation-evidence/restaurant-static-export.tar": "952e7ceb40766f5cab55706418db4e88f403495e88cce04b3e613282c066a135",
        "docs/restaurant-expo-alias-ruip6ad-20260925d-artifact-remediation-contract.md": "0c8be1a0a4d64048d60c1e1cd07d35ea59aad136e8886afcf7321ce97262a3c5",
        "scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs": "9b9889ba75d6e469d2f888ac9547786cc49a2a9f61f526d4c022bbdd11e2406f",
        "scripts/restaurant-alias-diagnostic-execution-support.mjs": "75fa86afe4979a4be5df2d2ac80d736c4e69e0aaeb6a2375b09680c11e2ae5b4",
        "scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs": "46874b6a903f45afd9509ec5dc7460f7a37c57172ce3920848871547713221df",
        "scripts/test-restaurant-alias-diagnostic-execution-support.mjs": "c00ce412842617ae4d81f47af6e4a6e925c2ea5a3120f9cc7cc7612d5d05bb12",
      }),
    }),
    Object.freeze({
      commit: "05dccec2ee33567e2949323822ab7dbad5dde6b3",
      parent: "0fef9c48fdf976ad860f1bd587af4334c926cd91",
      sourceManifestSha256: "71f84c4250b3b93ffb79b6449530b75284f541d3f6e7ea551801aac3cf5600d3",
      sourceManifestFiles: 1521,
      files: Object.freeze({
        "docs/restaurant-expo-alias-ruip6ad-20260925e-run-binding-contract.md": "301376512928cc0297656372c3b57ffdcecc2cf8eb50422bb9cd54833a5baa30",
        "docs/restaurant-expo-alias-ruip6ad-20260925e-run-binding-implementation-review.md": "ec6a3242401e2e326a2fb14cfa5e467c987d7cc4d27fe116fc75832401526239",
        "docs/restaurant-expo-alias-ruip6ad-20260925e-run-binding.diff": "1017a0e2334cf17450d4fd0f893dc8e2b9c1509b6f25843e57ad0b9cc5d9c857",
        "scripts/restaurant-alias-diagnostic-execution-support.mjs": "804a51b6f98a05b626157d6391857d3d1ed6d54ff8902b3bcf126035f15a9114",
        "scripts/test-restaurant-alias-diagnostic-execution-support.mjs": "0572693b3a11a6a7a8ec3c3331c96eabf418150be92a7b95c2a97ddd2cff881a",
      }),
    }),
    Object.freeze({
      commit: "7cc25e2d43d91c42fbcc3c9694e8792fc4042079",
      parent: "05dccec2ee33567e2949323822ab7dbad5dde6b3",
      sourceManifestSha256: "c7a5fcf1b65f0aa40a407c30590c301d3637b8b5b9a9a0b142d14e57353dc32f",
      sourceManifestFiles: 1527,
      files: Object.freeze({
        "docs/restaurant-expo-alias-artifact-remediation-evidence/candidate-artifact-manifest.json": "104d9af8d0f87ec2d631885567bef70bfe2fbbdc600989eaafffdbdfd6bfa54c",
        "docs/restaurant-expo-alias-artifact-remediation-evidence/complete-artifact-comparison.json": "96fb81608763356ef6c6d00fa73082de30b0efd1d4e830cdb348347cc7a947bd",
        "docs/restaurant-expo-alias-artifact-remediation-evidence/evidence-manifest.tsv": "24ea287ad87bc8cf33c41b3e38f42e2e4a636633acb8e4fcd7c16d0db3d141b2",
        "docs/restaurant-expo-alias-artifact-remediation-evidence/historical-noncanonical-restaurant-static-export.tar": "952e7ceb40766f5cab55706418db4e88f403495e88cce04b3e613282c066a135",
        "docs/restaurant-expo-alias-artifact-remediation-evidence/restaurant-static-export.tar": "477adc3170a52b095d8f92d49f46defa1d8001d7a647033d786590d2bda7184d",
        "docs/restaurant-expo-alias-canonical-archive-remediation-review.md": "8da336c9e2f3772206f214f4dd973539520da03c86a4c0961f985ed52fff39b9",
        "docs/restaurant-expo-alias-canonical-archive-remediation.diff": "283aa4155839162e9d7eba7e44c953748ce540c827cb1add52abf40ae3f9ead4",
        "docs/restaurant-expo-alias-ruip6ad-20260926f-run-binding-contract.md": "f0179ed7e632c38fcd47fc19e258270c8ed86420ac22f6f759da4424888dbdb2",
        "docs/restaurant-expo-alias-ruip6ad-20260926f-run-binding-implementation-review.md": "fe965b09e06c31b2e07a2fa7d36af1ec9041c912458cab4b2d38441fcca29ea6",
        "docs/restaurant-expo-alias-ruip6ad-20260926f-run-binding.diff": "45db7c244b7021e9ff0b368da2c3e7ab4ef3806b2f7d0a54bba90c32946612b0",
        "scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs": "e723d48faad8f4bce0a30231133cb944729fba665c6d24a8a7862bb664710159",
        "scripts/restaurant-alias-diagnostic-execution-support.mjs": "8a3a7de1a1cb48a2b4027951a8cd11858aeffd5d1e002fd6973f932cacfffe4d",
        "scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs": "113f6ab3f6af09d86d59d90fa7c9a8f4e325796b1579d60aa97326d9bc99d27c",
        "scripts/test-restaurant-alias-diagnostic-execution-support.mjs": "68c33f3629427205eb08960b4da368d84495efc482aec21f9f6c60cbef11eb56",
      }),
    }),
    Object.freeze({
      commit: "7262b4815ded41845f7cd431704ac3594933f70b",
      parent: "7cc25e2d43d91c42fbcc3c9694e8792fc4042079",
      sourceManifestSha256: "b8a19211bc1421ce4ce51517afdab01970aeb5171753596b93c84d2bab7ceb2f",
      sourceManifestFiles: 1530,
      files: Object.freeze({
        "docs/restaurant-expo-alias-publication-and-aborted-finalization-correction-report.md": "645f48a6dd274f4ba988da480ea47edf91ffd33c809dc0f00c99a8c781d3f055",
        "docs/restaurant-expo-alias-publication-and-aborted-finalization-correction.diff": "cc48d506746cf8bee5be6ef7baa8b34e6316fe2ec4e7520ded736616d9d46664",
        "docs/restaurant-expo-alias-ruip6ad-20260926g-run-binding-contract.md": "aef672add1d009a502a9f0faa037ddbaee9a412a10a16c59390d00234194d62f",
        "scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs": "c7d16e809bc570ba684aeefbfcd088534119c0805260d19fb6fbd97ea3bc7cae",
        "scripts/restaurant-alias-diagnostic-execution-support.mjs": "56616f784834db600db2edfaea84d6dbd9170815bd7abc3aeea63386c6fdf603",
        "scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs": "6394a896da8bc98dab3deb30c727595b586aea85d69b3b4dfdb57a66bf3d868e",
        "scripts/test-restaurant-alias-diagnostic-execution-support.mjs": "89b1225469e7f8e41f7046580339218a396a38847ef817dab76ab214051dbf05",
      }),
    }),
    Object.freeze({
      commit: "a93735ede9be8e8177e7034afdf9f19b3c176c3d",
      parent: "7262b4815ded41845f7cd431704ac3594933f70b",
      sourceManifestSha256: "96916aff299d24d367b637c41ce3094e440f69db06c6dd5c192b368f43f561e6",
      sourceManifestFiles: 1533,
      files: Object.freeze({
        "docs/restaurant-expo-alias-pending-access-firebase-finalization-remediation-report.md": "83abfadba24f6fb1e7838775e95774821326c81aba67a4eeb79d4c06a5b4bd00",
        "docs/restaurant-expo-alias-pending-access-firebase-finalization-remediation.diff": "60a0f3d3411afa303cf28181a4ecfcf9b52ce301957834f971daabdc0875bb77",
        "docs/restaurant-expo-alias-ruip6ad-20260926h-run-binding-contract.md": "9eaaa418496ddd838ad5464d7393bbc25a094084b9a6374f51058a283a9ae4bd",
        "scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs": "befeeeb14b81aa969b9ba62951df52d1e3b9d0d54b111f094206d578db675025",
        "scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs": "e2621bd4f6f300daf3a9c997990c244680b8e09bf7b7801dbd2d65d59c593828",
        "scripts/restaurant-alias-diagnostic-execution-support.mjs": "d9246b103665fc71db72b0c9b041391dc938f6d363ca8ac6ce51726824bf2add",
        "scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs": "f04b10d579767ea03a22b1dea4fef144087ea6099ab93a851c3e2be3fb88c3c7",
        "scripts/test-restaurant-alias-diagnostic-access-staging.mjs": "01a4a6c21809133620fd1610c3a7fd5e7d8d499b1438b76d8c0a9c26d19cd51c",
        "scripts/test-restaurant-alias-diagnostic-execution-support.mjs": "a7229b45a05b61daddc1787e0d9680040b631cf1b7a4004141e4b6875a75bc48",
      }),
    }),
    Object.freeze({
      commit: "a1cf25b443441d424259af2568ced55b00d5560a",
      parent: "a93735ede9be8e8177e7034afdf9f19b3c176c3d",
      sourceManifestSha256: "a2e022bdbbc494f9125c23b7f72cc784a4a37a0ac8d3f1e897388e24bc81e052",
      sourceManifestFiles: 1536,
      files: Object.freeze({
        "docs/restaurant-expo-alias-firebase-admin-dependency-correction-report.md": "3c6c6efa969d5a3f2c0a7702768b15325dc2ec6a34bb342607d869305f9dee12",
        "docs/restaurant-expo-alias-firebase-admin-dependency-correction.diff": "4cee2a51c3a6f61e99f2facd3a482cf6147a17c719bf950275c9f43c2414d95d",
        "docs/restaurant-expo-alias-ruip6ad-20260926i-run-binding-contract.md": "038183d452ae0ad65319e5b7bb7fcc45c2c59f49a20f407c645733b0c3cac9a7",
        "scripts/restaurant-alias-diagnostic-execution-support.mjs": "f4e15824c2a0a4a1a61bb233250722e0ae99b5b4a3fc0f0fb34cfb45cee2a8ce",
        "scripts/test-restaurant-alias-diagnostic-execution-support.mjs": "4c35efb102bbe56feb412ba6641aa4cb43fe1515ce4b311e038f5341262927ee",
      }),
    }),
  ]),
  diagnosticExecutableFiles: Object.freeze({
    "apps/restaurant/metro.config.js": "c1c09a3089568b12c4aeb9c1d30afb47bb7722dc9605fe534152424a4a2e64ad",
    "apps/restaurant/scripts/deterministic-metro-module-ids.cjs": "6201d56d5a815a5827d0625ac72878fed89fd9bb7255ca52cbfd0a690b74e54a",
    "apps/restaurant/scripts/deterministic-metro-module-map.json": "928fcbe1ba9aead4c2f180503254a4a6826033c33eabbad8f29fca24e4a056c8",
    "scripts/restaurant-alias-parity-verifier.mjs": "e563d7a5203aaf6ea0e04687063d63027568fd2906accec43c26daaeea4ca1d8",
    "scripts/test-restaurant-alias-parity-verifier.mjs": "6fa1ce21c047f93678be3c45fb71cd1f0e8167ed142fc259e55efddea1030afb",
    "scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs": "865c1032ce89fef6efac32affcfb30f512a5743a91821c1079be7d599396c018",
    "scripts/test-restaurant-alias-10-minute-diagnostic-operator.mjs": "6fce949367cfdc4c985d9fe87f632dba2779f53e4d75235322d4063a3f23839a",
    "scripts/test-restaurant-alias-read-only-eas-export-readiness.mjs": "5ba2c364a4e7e46fb5ef40a34fefb99f1165d7bb9ad93ed7c3cc417c7f76a016",
    "scripts/test-restaurant-deterministic-metro-module-ids.mjs": "c262a93e6788b0508bd07fdcb612f1126d9c440274ce4ea04901be7ff5930213",
    "scripts/verify-restaurant-alias-production-export-readiness.mjs": "451ab6f2b0e3b68a1ea1fd58eeb99ef0e8e1dd2920a4dc5ca479b1767e430684",
    "scripts/qualify-restaurant-alias-diagnostic-access-staging.mjs": "e2621bd4f6f300daf3a9c997990c244680b8e09bf7b7801dbd2d65d59c593828",
    "scripts/test-restaurant-alias-diagnostic-access-staging.mjs": "01a4a6c21809133620fd1610c3a7fd5e7d8d499b1438b76d8c0a9c26d19cd51c",
  }),
  applicationTree: DIAGNOSTIC_OPERATOR.applicationTree,
  runId: "ruip6ad_20260926j",
  evidenceDirectory: "secure/restaurant-alias-diagnostic/ruip6ad_20260926j",
  authorityDirectory: "secure/restaurant-alias-diagnostic-authority",
  migrationFunctions: Object.freeze({
    "private.raise_restaurant_order_conflict_v1(text)": Object.freeze({
      sha256: "7f381cd2857ebeb5bd24cb6f55edcc897eeb7d73d45a12d790c24f70656c0c9c",
      owner: "hungrie_api_owner", securityDefiner: true, volatility: "v", config: "search_path=\"\"",
      acl: "{hungrie_api_owner=X/hungrie_api_owner}",
    }),
    "public.restaurant_acknowledge_order_seen_v1(text,timestamp with time zone,uuid)": Object.freeze({
      sha256: "5229df80acf9bd1546c5c13bfbd62874426c0953e8126f8345dacb4fcf69e843",
      owner: "hungrie_api_owner", securityDefiner: true, volatility: "v", config: "search_path=\"\"",
      acl: "{=X/hungrie_api_owner,hungrie_api_owner=X/hungrie_api_owner,service_role=X/hungrie_api_owner,authenticated=X/hungrie_api_owner}",
    }),
    "public.restaurant_transition_order_v1(text,timestamp with time zone,text,text,text,uuid)": Object.freeze({
      sha256: "a5cd9f921b678df1092c0d26b2e1350e02fec1a80cb726792e7d9c46a23d2797",
      owner: "hungrie_api_owner", securityDefiner: true, volatility: "v", config: "search_path=\"\"",
      acl: "{=X/hungrie_api_owner,hungrie_api_owner=X/hungrie_api_owner,service_role=X/hungrie_api_owner,authenticated=X/hungrie_api_owner}",
    }),
  }),
  actions: Object.freeze([
    "export", "capture-rollback", "deploy", "verify-immutable",
    "qualify-immutable-access", "promote", "observe-alias", "rollback", "verify-rollback",
  ]),
  supportActions: Object.freeze([
    "prepare-authority", "baseline-preflight", "initialize-resources", "begin-deployment",
    "register-deployment", "record-deployment-uncertainty", "produce-deployment-reconciliation", "reconcile-deployment", "prepare-recapture",
    "verify-recapture", "final-preflight", "prepare-expected-alias", "prepare-cleanup",
    "record-abort", "produce-deployment-reconciliation", "finalize",
  ]),
  rollbackContract: Object.freeze({ routes: 6, deploymentDerivedAssets: true, runtimeFiles: 3, externalRuntime: 2 }),
  freshnessMs: Object.freeze({ baseline: 10 * 60_000, final: 10 * 60_000, rollback: 5 * 60_000 }),
});

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value, null, 2) + "\n";
const placeholder = value => typeof value !== "string" || !value.trim() || /<[^>]+>|placeholder|todo|replace[_ -]?me|example authorization/i.test(value);
const iso = milliseconds => new Date(milliseconds).toISOString();

export function verifyLocalDiagnosticPrerequisites({
  root,
  chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  requireFactory = createRequire,
} = {}) {
  if (!root) throw new Error("Repository root is required for local prerequisite verification.");
  const functionsRoot = path.join(root, "functions");
  const packagePath = path.join(functionsRoot, "package.json");
  const lockPath = path.join(functionsRoot, "package-lock.json");
  const installedPackagePath = path.join(functionsRoot, "node_modules/firebase-admin/package.json");
  for (const file of [packagePath, lockPath, installedPackagePath, chromePath]) {
    if (!fs.existsSync(file)) throw new Error(`Required local diagnostic prerequisite is missing: ${path.relative(root, file) || file}.`);
  }
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const installed = JSON.parse(fs.readFileSync(installedPackagePath, "utf8"));
  const lockedAdmin = lock.packages?.["node_modules/firebase-admin"]?.version;
  const lockedFunctions = lock.packages?.["node_modules/firebase-functions"]?.version;
  if (lock.lockfileVersion !== 3 || lockedAdmin !== installed.version || packageJson.dependencies?.["firebase-admin"] !== lock.packages?.[""]?.dependencies?.["firebase-admin"] || packageJson.dependencies?.["firebase-functions"] !== lock.packages?.[""]?.dependencies?.["firebase-functions"] || !lockedFunctions) throw new Error("Functions dependencies do not match the exact lockfile-defined installation.");
  const functionsRequire = requireFactory(packagePath);
  const adminApp = functionsRequire("firebase-admin/app");
  const adminExports = ["cert", "initializeApp", "deleteApp", "getApps"];
  if (adminExports.some(name => typeof adminApp[name] !== "function")) throw new Error("firebase-admin/app does not expose the required diagnostic lifecycle API.");
  functionsRequire.resolve("firebase-functions");
  if (typeof fetch !== "function" || typeof WebSocket !== "function") throw new Error("The diagnostic Node runtime lacks required fetch or WebSocket support.");
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (!Number.isSafeInteger(nodeMajor) || nodeMajor < 22) throw new Error("Node 22 or newer is required for the diagnostic operator.");
  return {
    passed: true,
    firebaseAdminVersion: lockedAdmin,
    firebaseFunctionsVersion: lockedFunctions,
    firebaseAdminApp: functionsRequire.resolve("firebase-admin/app"),
    chromePath,
    node: process.versions.node,
  };
}

export function sanitizeSupportError(error) {
  return sanitizeError(error);
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(file), 0o700);
  const temporary = file + "." + process.pid + ".tmp";
  fs.writeFileSync(temporary, Buffer.isBuffer(value) ? value : canonical(value), { mode: 0o600 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function parseOptions(argv) {
  const [action, ...rest] = argv;
  const values = Object.fromEntries(rest.filter(value => value.startsWith("--") && value.includes("=")).map(value => {
    const index = value.indexOf("=");
    return [value.slice(2, index), value.slice(index + 1)];
  }));
  return { action, values };
}

function required(value, label) {
  if (placeholder(value)) throw new Error(label + " is missing or contains a placeholder.");
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(label + " fields differ from the reviewed schema.");
}

export function buildSourceManifest(repoRoot, commit = SUPPORT.baseCheckpoint, spawn = spawnSync) {
  const tree = spawn("git", ["ls-tree", "-r", "--name-only", "-z", commit], { cwd: repoRoot, encoding: null, maxBuffer: 128 * 1024 * 1024 });
  if (tree.status !== 0) throw new Error("Unable to enumerate accepted checkpoint.");
  const paths = tree.stdout.toString("utf8").split("\0").filter(Boolean).sort();
  const lines = [];
  for (const relative of paths) {
    const blob = spawn("git", ["show", commit + ":" + relative], { cwd: repoRoot, encoding: null, maxBuffer: 128 * 1024 * 1024 });
    if (blob.status !== 0) throw new Error("Unable to read checkpoint blob: " + relative);
    lines.push(sha256(blob.stdout) + "\t" + blob.stdout.length + "\t" + relative + "\n");
  }
  const bytes = Buffer.from(lines.join(""));
  return { commit, files: paths.length, bytes, sha256: sha256(bytes) };
}

function gitResult(repoRoot, args, spawn, encoding = "utf8") {
  const result = spawn("git", args, { cwd: repoRoot, encoding, maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error("Unable to verify accepted checkpoint lineage.");
  return result.stdout;
}

function commitInventory(repoRoot, commit, spawn) {
  return String(gitResult(repoRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", commit], spawn)).trim().split("\n").filter(Boolean).sort();
}

function commitFileSha256(repoRoot, commit, relative, spawn) {
  const bytes = gitResult(repoRoot, ["show", commit + ":" + relative], spawn, null);
  return sha256(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
}

export function verifyAcceptedCheckpointLineage({ repoRoot, spawn = spawnSync, manifestBuilder = buildSourceManifest }) {
  for (const checkpoint of SUPPORT.acceptedLineage) {
    const parent = String(gitResult(repoRoot, ["rev-parse", checkpoint.commit + "^"], spawn)).trim();
    if (parent !== checkpoint.parent) throw new Error("Accepted checkpoint parent mismatch: " + checkpoint.commit + ".");
    const inventory = commitInventory(repoRoot, checkpoint.commit, spawn);
    if (JSON.stringify(inventory) !== JSON.stringify(Object.keys(checkpoint.files).sort())) throw new Error("Accepted checkpoint inventory mismatch: " + checkpoint.commit + ".");
    for (const [relative, expected] of Object.entries(checkpoint.files)) {
      if (commitFileSha256(repoRoot, checkpoint.commit, relative, spawn) !== expected) throw new Error("Accepted checkpoint file hash mismatch: " + checkpoint.commit + ":" + relative + ".");
    }
    const manifest = manifestBuilder(repoRoot, checkpoint.commit, spawn);
    if (manifest.sha256 !== checkpoint.sourceManifestSha256 || manifest.files !== checkpoint.sourceManifestFiles) throw new Error("Accepted checkpoint source manifest mismatch: " + checkpoint.commit + ".");
    const applicationTree = String(gitResult(repoRoot, ["rev-parse", checkpoint.commit + ":apps/restaurant"], spawn)).trim();
    if (applicationTree !== SUPPORT.historicalApplicationTree) throw new Error("Accepted checkpoint Restaurant tree mismatch: " + checkpoint.commit + ".");
  }
  return { passed: true, checkpoints: SUPPORT.acceptedLineage.map(value => value.commit) };
}

export function verifyAcceptedDiagnosticExecutables({ repoRoot, commit, spawn = spawnSync }) {
  for (const [relative, expected] of Object.entries(SUPPORT.diagnosticExecutableFiles)) {
    if (commitFileSha256(repoRoot, commit, relative, spawn) !== expected) throw new Error("Accepted diagnostic executable changed: " + relative + ".");
  }
  if (commitFileSha256(repoRoot, commit, SUPPORT.proposalPath, spawn) !== SUPPORT.proposalSha256) throw new Error("Reviewed execution proposal hash mismatch.");
  return { passed: true, files: Object.keys(SUPPORT.diagnosticExecutableFiles).length };
}

export function validateOwnerAuthorization(input) {
  const fields = [
    "contractVersion", "decision", "approvedForHostedExecution", "environment", "runId",
    "proposalSha256", "checkpointParent", "sourceCommit", "sourceManifestSha256", "applicationTree", "authorizedActions", "authorizedSupportActions",
    "authorizationText", "authorizationTextSha256", "issuedAt", "maintenanceWindowStart", "maintenanceWindowEnd",
  ];
  exactKeys(input, fields, "Owner authorization");
  if (input.contractVersion !== 1 || input.decision !== "APPROVE_ONE_RUN_STAGING_ALIAS_DIAGNOSTIC" || input.approvedForHostedExecution !== true || input.environment !== "staging") throw new Error("Explicit one-run Staging approval is required.");
  if (input.runId !== SUPPORT.runId || input.proposalSha256 !== SUPPORT.proposalSha256 || input.checkpointParent !== SUPPORT.baseCheckpoint || !/^[a-f0-9]{40}$/.test(input.sourceCommit || "") || input.sourceCommit === SUPPORT.baseCheckpoint || !/^[a-f0-9]{64}$/.test(input.sourceManifestSha256 || "") || input.applicationTree !== SUPPORT.applicationTree) throw new Error("Owner authorization identity mismatch.");
  if (JSON.stringify(input.authorizedActions) !== JSON.stringify(SUPPORT.actions)) throw new Error("Owner authorization actions are incomplete or contradictory.");
  if (JSON.stringify(input.authorizedSupportActions) !== JSON.stringify(SUPPORT.supportActions)) throw new Error("Owner authorization support actions are incomplete or contradictory.");
  required(input.authorizationText, "Owner authorization text");
  if (input.authorizationText.length < 80 || input.authorizationTextSha256 !== sha256(Buffer.from(input.authorizationText))) throw new Error("Owner authorization text digest mismatch.");
  if (!/authorize/i.test(input.authorizationText) || !/staging/i.test(input.authorizationText) || !input.authorizationText.includes(SUPPORT.runId) || !/rollback/i.test(input.authorizationText) || !/earnings.+disabled/i.test(input.authorizationText)) throw new Error("Owner authorization text lacks required explicit boundaries.");
  const issued = Date.parse(input.issuedAt), start = Date.parse(input.maintenanceWindowStart), end = Date.parse(input.maintenanceWindowEnd);
  if (!Number.isFinite(issued) || !Number.isFinite(start) || !Number.isFinite(end) || start < issued || end <= start || end - start > 2 * 60 * 60_000) throw new Error("Owner authorization or maintenance window timestamp is invalid.");
  return input;
}

export function verifyReviewedCandidateCheckpoint({ repoRoot, approval, spawn = spawnSync, lineageVerifier = verifyAcceptedCheckpointLineage, executableVerifier = verifyAcceptedDiagnosticExecutables }) {
  validateOwnerAuthorization(approval);
  lineageVerifier({ repoRoot, spawn });
  const manifest = buildSourceManifest(repoRoot, approval.sourceCommit, spawn);
  if (manifest.sha256 !== approval.sourceManifestSha256) throw new Error("Approved support-checkpoint source manifest was not reproduced.");
  if (spawn("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim() !== approval.sourceCommit) throw new Error("Repository HEAD is not the approved support checkpoint.");
  if (spawn("git", ["rev-parse", approval.sourceCommit + "^"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim() !== SUPPORT.baseCheckpoint) throw new Error("Diagnostic-readiness checkpoint is not a direct child of the accepted parent.");
  const inventory = spawn("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", approval.sourceCommit], { cwd: repoRoot, encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean).sort();
  if (JSON.stringify(inventory) !== JSON.stringify([...SUPPORT.checkpointFiles].sort())) throw new Error("Diagnostic-readiness checkpoint inventory differs from the reviewed scope.");
  if (spawn("git", ["rev-parse", approval.sourceCommit + ":apps/restaurant"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim() !== SUPPORT.applicationTree) throw new Error("Restaurant application tree changed.");
  executableVerifier({ repoRoot, commit: approval.sourceCommit, spawn });
  return { passed: true, manifest, inventory, commit: approval.sourceCommit };
}

export function prepareAuthorityArtifacts({ repoRoot, approval, outputDirectory, spawn = spawnSync, lineageVerifier = verifyAcceptedCheckpointLineage, executableVerifier = verifyAcceptedDiagnosticExecutables }) {
  const verified = verifyReviewedCandidateCheckpoint({ repoRoot, approval, spawn, lineageVerifier, executableVerifier });
  const manifest = verified.manifest;
  const authority = {
    contractVersion: 1,
    approvedForHostedExecution: true,
    environment: "staging",
    planSha256: DIAGNOSTIC_OPERATOR.planSha256,
    applicationTree: SUPPORT.applicationTree,
    artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256,
    archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256,
    easProjectId: DIAGNOSTIC_OPERATOR.easProjectId,
    supabaseProjectRef: DIAGNOSTIC_OPERATOR.supabaseProjectRef,
    firebaseProjectId: DIAGNOSTIC_OPERATOR.firebaseProjectId,
    aliasId: DIAGNOSTIC_OPERATOR.aliasId,
    aliasName: DIAGNOSTIC_OPERATOR.aliasName,
    aliasUrl: DIAGNOSTIC_OPERATOR.aliasUrl,
    runId: SUPPORT.runId,
    sourceCommit: approval.sourceCommit,
    sourceManifestSha256: approval.sourceManifestSha256,
    ownerAuthorizationSha256: approval.authorizationTextSha256,
    maintenanceWindowStart: approval.maintenanceWindowStart,
    maintenanceWindowEnd: approval.maintenanceWindowEnd,
  };
  const manifestPath = path.join(outputDirectory, SUPPORT.runId + "-source-manifest.tsv");
  const authorityPath = path.join(outputDirectory, SUPPORT.runId + "-authority.json");
  if (fs.existsSync(manifestPath) || fs.existsSync(authorityPath)) throw new Error("Authority artifacts already exist; overwrite prohibited.");
  atomicWrite(manifestPath, manifest.bytes);
  atomicWrite(authorityPath, authority);
  return { authority, authorityPath, manifestPath, authoritySha256: sha256(fs.readFileSync(authorityPath)), sourceManifestSha256: manifest.sha256, files: manifest.files };
}

function observation(value, label, binding = {}) {
  const keys = ["runId", "stage", "source", "requestId", "startedAt", "completedAt", "status", "payloadSha256", "payload"];
  exactKeys(value, keys, label + " observation");
  if (binding.runId && value.runId !== binding.runId) throw new Error(label + " observation run binding mismatch.");
  if (binding.stage && value.stage !== binding.stage) throw new Error(label + " observation stage binding mismatch.");
  if (binding.source && value.source !== binding.source) throw new Error(label + " observation source binding mismatch.");
  required(value.source, label + " source");
  required(value.requestId, label + " request ID");
  if (!Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.completedAt)) || Date.parse(value.completedAt) < Date.parse(value.startedAt)) throw new Error(label + " timestamps are invalid.");
  if (binding.capturedAt) {
    const age = Date.parse(binding.capturedAt) - Date.parse(value.completedAt);
    if (age < 0 || age > binding.maximumAgeMs) throw new Error(label + " observation is stale or future-dated.");
  }
  const allowedStatuses = binding.allowedStatuses || [200];
  if (!Array.isArray(allowedStatuses) || !allowedStatuses.includes(value.status) || !/^[a-f0-9]{64}$/.test(value.payloadSha256) || value.payloadSha256 !== sha256(Buffer.from(canonical(value.payload)))) throw new Error(label + " independent read is incomplete or unverified.");
  return value;
}

function validateCatalog(rows) {
  if (!Array.isArray(rows) || rows.length !== 3) throw new Error("Exact function catalog required.");
  for (const [identity, expected] of Object.entries(SUPPORT.migrationFunctions)) {
    const row = rows.find(value => value.identity === identity);
    if (!row || row.definition_sha256 !== expected.sha256 || row.owner !== expected.owner || row.security_definer !== expected.securityDefiner || row.volatility !== expected.volatility || row.config !== expected.config || row.acl !== expected.acl) throw new Error("Function or ACL state mismatch: " + identity);
  }
}

function validateSnapshotReads(reads, stage, binding) {
  const names = ["supabaseProject", "firebaseProject", "alias", "migrationHistory", "functionCatalog", "earnings"];
  const sources = { supabaseProject: "supabase-project", firebaseProject: "firebase-project", alias: "expo-alias", migrationHistory: "supabase-migrations", functionCatalog: "supabase-function-catalog", earnings: "supabase-earnings-capability" };
  exactKeys(reads, names, stage + " read set");
  const sqlSources = new Set(["migrationHistory", "functionCatalog", "earnings"]);
  const validated = Object.fromEntries(names.map(name => [name, observation(reads[name], name, { ...binding, source: sources[name], allowedStatuses: sqlSources.has(name) ? [200, 201] : [200] })]));
  const ids = validated;
  if (ids.supabaseProject.payload.id !== DIAGNOSTIC_OPERATOR.supabaseProjectRef || ids.supabaseProject.payload.status !== "ACTIVE_HEALTHY") throw new Error("Wrong or unhealthy Staging Supabase project.");
  if (ids.firebaseProject.payload.projectId !== DIAGNOSTIC_OPERATOR.firebaseProjectId) throw new Error("Wrong Firebase project.");
  const alias = ids.alias.payload;
  if (alias.easProjectId !== DIAGNOSTIC_OPERATOR.easProjectId || alias.aliasId !== DIAGNOSTIC_OPERATOR.aliasId || alias.aliasName !== DIAGNOSTIC_OPERATOR.aliasName || alias.aliasUrl !== DIAGNOSTIC_OPERATOR.aliasUrl || !alias.deploymentIdentifier) throw new Error("Wrong or incomplete EAS alias identity.");
  const history = ids.migrationHistory.payload;
  if (!Array.isArray(history.applied) || history.applied.filter(value => value === DIAGNOSTIC_OPERATOR.conflictMigration.version).length !== 1 || !Array.isArray(history.pending) || history.pending.length !== 0 || history.localMigrationSha256 !== DIAGNOSTIC_OPERATOR.conflictMigration.sha256) throw new Error("Migration parity or zero-pending requirement failed.");
  validateCatalog(ids.functionCatalog.payload.rows);
  if (ids.earnings.payload.capability !== "restaurant_earnings_v1" || ids.earnings.payload.enabled !== false) throw new Error("Earnings must remain disabled.");
  const requestIds = names.map(name => validated[name].requestId);
  if (new Set(requestIds).size !== requestIds.length) throw new Error("Every hosted assertion requires an independent recorded read.");
  return {
    stage,
    observations: validated,
    identities: {
      supabaseProjectRef: ids.supabaseProject.payload.id,
      firebaseProjectId: ids.firebaseProject.payload.projectId,
      easProjectId: alias.easProjectId,
      aliasId: alias.aliasId,
      aliasName: alias.aliasName,
      aliasUrl: alias.aliasUrl,
    },
    alias,
    migration: {
      version: DIAGNOSTIC_OPERATOR.conflictMigration.version,
      sha256: history.localMigrationSha256,
      appliedExactlyOnce: true,
      pendingCount: 0,
    },
    earnings: { capability: "restaurant_earnings_v1", enabled: false },
  };
}

function requireRunEvidence(file, label) {
  if (!fs.existsSync(file)) throw new Error(label + " evidence is missing.");
  const bytes = fs.readFileSync(file);
  return { value: JSON.parse(bytes), sha256: sha256(bytes), file };
}

function writeExclusive(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const descriptor = fs.openSync(file, "wx", 0o600);
  try { fs.writeFileSync(descriptor, Buffer.isBuffer(value) ? value : canonical(value)); }
  finally { fs.closeSync(descriptor); }
  return file;
}

function relativeToRun(runDirectory, file) {
  const resolvedRun = path.resolve(runDirectory);
  const resolved = path.resolve(file);
  if (!resolved.startsWith(resolvedRun + path.sep)) throw new Error("Evidence path escapes the run directory.");
  return path.relative(resolvedRun, resolved).split(path.sep).join("/");
}

function fileIdentity(runDirectory, file) {
  const bytes = fs.readFileSync(file);
  return { path: relativeToRun(runDirectory, file), bytes: bytes.length, sha256: sha256(bytes) };
}

function validateRollbackReference(value, authority, label = "Rollback reference") {
  try { validateDeploymentRollbackReference(value, authority.runId); }
  catch (error) { throw new Error(label + ": " + error.message); }
  if (!Number.isFinite(Date.parse(value.capturedAt || ""))) throw new Error(label + " timestamp is invalid.");
  return value;
}

function validateRollbackProgress(value, authority, reference) {
  if (value?.schemaVersion !== 2 || value.runId !== authority.runId || value.passed !== true || value.completedAt !== reference.capturedAt || value.metadata?.deploymentIdentifier !== reference.deploymentIdentifier) throw new Error("Rollback capture progress does not match the completed reference.");
  const parity = rows => Array.isArray(rows) && rows.every(row => row?.parity === true || row?.passed === true);
  if (value.routes?.length !== 6 || !parity(value.routes) || value.criticalAssets?.length !== reference.criticalAssets.length || !parity(value.criticalAssets) || value.runtimeFiles?.length !== 3 || !parity(value.runtimeFiles) || value.externalRuntime?.length !== 2 || !parity(value.externalRuntime)) throw new Error("Rollback capture progress is incomplete.");
  const project = row => Object.fromEntries(Object.entries(row).filter(([key]) => ["route","asset","path","url","bytes","sha256","referencedAssets"].includes(key)));
  for (const key of ["routes", "criticalAssets", "runtimeFiles", "externalRuntime"]) if (JSON.stringify(value[key].map(project)) !== JSON.stringify(reference[key])) throw new Error("Rollback progress and reference content differ.");
  return value;
}

function updateRecaptureAttempt(runDirectory, value) {
  atomicWrite(path.join(runDirectory, "fresh-recapture-attempt.json"), value);
  return value;
}

export function prepareFreshRollbackRecapture({ runDirectory, authority, capturedAt, interruptAt = null }) {
  const attemptPath = path.join(runDirectory, "fresh-recapture-attempt.json");
  const verificationPath = path.join(runDirectory, "fresh-recapture-verification.json");
  if (fs.existsSync(path.join(runDirectory, "terminal-record.json"))) throw new Error("Terminal runs must finalize from preserved rollback evidence; fresh recapture is prohibited.");
  if (fs.existsSync(verificationPath)) throw new Error("Fresh recapture is already verified; retry prohibited.");
  const attemptId = authority.runId + ":fresh-rollback-recapture";
  const attempt = { schemaVersion: 1, runId: authority.runId, attemptId, initiatedAt: capturedAt, state: "INITIATED", historical: null, quarantine: {}, failure: null };
  writeExclusive(attemptPath, attempt);
  if (interruptAt === "after-initiation") throw new Error("Synthetic interruption after recapture initiation.");
  const referencePath = path.join(runDirectory, "rollback-reference.json");
  const progressPath = path.join(runDirectory, "rollback-capture-progress.json");
  if (!fs.existsSync(referencePath) || !fs.existsSync(progressPath)) throw new Error("Canonical rollback reference and progress are required for preservation.");
  const reference = requireRunEvidence(referencePath, "Historical rollback reference");
  const progress = requireRunEvidence(progressPath, "Historical rollback progress");
  validateRollbackReference(reference.value, authority, "Historical rollback reference");
  validateRollbackProgress(progress.value, authority, reference.value);
  const historyDirectory = path.join(runDirectory, "rollback-history", attemptId.replace(/[^a-zA-Z0-9._-]/g, "_"));
  const historicalReference = path.join(historyDirectory, "rollback-reference.json");
  const historicalProgress = path.join(historyDirectory, "rollback-capture-progress.json");
  writeExclusive(historicalReference, fs.readFileSync(referencePath));
  writeExclusive(historicalProgress, fs.readFileSync(progressPath));
  attempt.historical = { reference: fileIdentity(runDirectory, historicalReference), progress: fileIdentity(runDirectory, historicalProgress) };
  if (attempt.historical.reference.sha256 !== reference.sha256 || attempt.historical.progress.sha256 !== progress.sha256) throw new Error("Historical rollback preservation hash mismatch.");
  attempt.state = "PRESERVED";
  updateRecaptureAttempt(runDirectory, attempt);
  if (interruptAt === "after-preservation" || interruptAt === "before-reference-movement") throw new Error("Synthetic interruption after rollback preservation.");
  const quarantineDirectory = path.join(runDirectory, "rollback-recapture-quarantine", attemptId.replace(/[^a-zA-Z0-9._-]/g, "_"));
  fs.mkdirSync(quarantineDirectory, { recursive: true, mode: 0o700 });
  const quarantinedReference = path.join(quarantineDirectory, "rollback-reference.json");
  fs.renameSync(referencePath, quarantinedReference);
  attempt.quarantine.reference = fileIdentity(runDirectory, quarantinedReference);
  attempt.state = "REFERENCE_QUARANTINED";
  updateRecaptureAttempt(runDirectory, attempt);
  if (interruptAt === "after-reference-movement") throw new Error("Synthetic interruption after rollback reference quarantine.");
  const quarantinedProgress = path.join(quarantineDirectory, "rollback-capture-progress.json");
  fs.renameSync(progressPath, quarantinedProgress);
  attempt.quarantine.progress = fileIdentity(runDirectory, quarantinedProgress);
  if (attempt.quarantine.reference.sha256 !== reference.sha256 || attempt.quarantine.progress.sha256 !== progress.sha256) throw new Error("Quarantined rollback evidence hash mismatch.");
  attempt.state = "READY_FOR_RECAPTURE";
  attempt.readyAt = capturedAt;
  updateRecaptureAttempt(runDirectory, attempt);
  if (interruptAt === "after-progress-movement" || interruptAt === "before-capture") throw new Error("Synthetic interruption before fresh rollback capture.");
  return attempt;
}

function validateHistoricalRecapture(runDirectory, attempt) {
  for (const kind of ["reference", "progress"]) {
    const historical = attempt.historical?.[kind];
    const quarantined = attempt.quarantine?.[kind];
    if (!historical || !quarantined) throw new Error("Historical rollback preservation is incomplete.");
    for (const row of [historical, quarantined]) {
      const file = path.join(runDirectory, row.path || "");
      if (!row.path || !file.startsWith(path.resolve(runDirectory) + path.sep) || !fs.existsSync(file) || fs.statSync(file).size !== row.bytes || sha256(fs.readFileSync(file)) !== row.sha256) throw new Error("Historical rollback evidence changed or is missing.");
    }
    if (historical.sha256 !== quarantined.sha256 || historical.bytes !== quarantined.bytes) throw new Error("Historical and quarantined rollback evidence differ.");
  }
}

export function verifyFreshRollbackRecapture({ runDirectory, authority, capturedAt, currentMs = Date.now() }) {
  const attemptRecord = requireRunEvidence(path.join(runDirectory, "fresh-recapture-attempt.json"), "Fresh recapture attempt");
  const attempt = attemptRecord.value;
  if (attempt.schemaVersion !== 1 || attempt.runId !== authority.runId || attempt.attemptId !== authority.runId + ":fresh-rollback-recapture" || attempt.state !== "READY_FOR_RECAPTURE") throw new Error("Fresh recapture attempt is not ready for verification.");
  validateHistoricalRecapture(runDirectory, attempt);
  const reference = requireRunEvidence(path.join(runDirectory, "rollback-reference.json"), "Fresh rollback reference");
  const progress = requireRunEvidence(path.join(runDirectory, "rollback-capture-progress.json"), "Fresh rollback progress");
  const captureMarker = requireRunEvidence(path.join(runDirectory, "rollback-capture-fresh-attempt.json"), "Fresh rollback capture attempt");
  if (captureMarker.value.runId !== authority.runId || captureMarker.value.phase !== "fresh" || captureMarker.value.state !== "COMPLETE" || captureMarker.value.contractSha256 !== reference.value.contractSha256) throw new Error("Fresh rollback capture phase is incomplete or mismatched.");
  validateRollbackReference(reference.value, authority, "Fresh rollback reference");
  validateRollbackProgress(progress.value, authority, reference.value);
  const capturedMs = Date.parse(reference.value.capturedAt);
  if (capturedMs < Date.parse(attempt.initiatedAt) || capturedMs > currentMs + 5_000 || currentMs - capturedMs > SUPPORT.freshnessMs.rollback) throw new Error("Fresh rollback capture timestamp is stale or precedes the recapture attempt.");
  if (reference.sha256 === attempt.historical.reference.sha256 || progress.sha256 === attempt.historical.progress.sha256) throw new Error("Canonical rollback evidence was not freshly captured.");
  const value = {
    schemaVersion: 1, passed: true, runId: authority.runId, attemptId: attempt.attemptId, verifiedAt: capturedAt,
    deploymentIdentifier: reference.value.deploymentIdentifier, capturedAt: reference.value.capturedAt,
    canonical: { reference: fileIdentity(runDirectory, reference.file), progress: fileIdentity(runDirectory, progress.file), captureAttempt: fileIdentity(runDirectory, captureMarker.file) },
    historical: attempt.historical, quarantine: attempt.quarantine,
    contract: { routes: SUPPORT.rollbackContract.routes, criticalAssets: reference.value.criticalAssets.length, runtimeFiles: reference.value.runtimeFiles.length, externalRuntime: reference.value.externalRuntime.length, contractSha256: reference.value.contractSha256 },
  };
  const output = path.join(runDirectory, "fresh-recapture-verification.json");
  writeExclusive(output, value);
  attempt.state = "VERIFIED";
  attempt.verifiedAt = capturedAt;
  attempt.verificationSha256 = sha256(fs.readFileSync(output));
  updateRecaptureAttempt(runDirectory, attempt);
  return value;
}

function consumeFreshRollbackRecapture(runDirectory, authority, currentMs) {
  const attempt = requireRunEvidence(path.join(runDirectory, "fresh-recapture-attempt.json"), "Fresh recapture attempt");
  const verification = requireRunEvidence(path.join(runDirectory, "fresh-recapture-verification.json"), "Fresh recapture verification");
  if (attempt.value.state !== "VERIFIED" || attempt.value.verificationSha256 !== verification.sha256 || verification.value.passed !== true || verification.value.runId !== authority.runId || verification.value.attemptId !== attempt.value.attemptId) throw new Error("Completed verified fresh rollback recapture is mandatory.");
  validateHistoricalRecapture(runDirectory, attempt.value);
  const reference = requireRunEvidence(path.join(runDirectory, "rollback-reference.json"), "Fresh rollback reference");
  const progress = requireRunEvidence(path.join(runDirectory, "rollback-capture-progress.json"), "Fresh rollback progress");
  const captureMarker = requireRunEvidence(path.join(runDirectory, "rollback-capture-fresh-attempt.json"), "Fresh rollback capture attempt");
  if (captureMarker.value.runId !== authority.runId || captureMarker.value.phase !== "fresh" || captureMarker.value.state !== "COMPLETE" || captureMarker.value.contractSha256 !== reference.value.contractSha256) throw new Error("Fresh rollback capture phase is incomplete or mismatched.");
  validateRollbackReference(reference.value, authority, "Fresh rollback reference");
  validateRollbackProgress(progress.value, authority, reference.value);
  if (verification.value.canonical?.reference?.sha256 !== reference.sha256 || verification.value.canonical?.reference?.bytes !== fs.statSync(reference.file).size || verification.value.canonical?.progress?.sha256 !== progress.sha256 || verification.value.canonical?.progress?.bytes !== fs.statSync(progress.file).size || verification.value.canonical?.captureAttempt?.sha256 !== captureMarker.sha256) throw new Error("Canonical rollback evidence changed after fresh verification.");
  const capturedMs = Date.parse(reference.value.capturedAt);
  if (capturedMs > currentMs + 5_000 || currentMs - capturedMs > SUPPORT.freshnessMs.rollback) throw new Error("Verified fresh rollback evidence is stale.");
  return { attempt, verification, reference, progress };
}

function consumePreservedTerminalRollback(runDirectory, authority) {
  const terminal = requireRunEvidence(path.join(runDirectory, "terminal-record.json"), "Terminal record");
  if (terminal.value.runId !== authority.runId || !["FAIL", "INCONCLUSIVE", "ABORTED"].includes(terminal.value.classification) || terminal.value.promotionRetryPermitted !== false) throw new Error("Terminal rollback evidence is not bound to a fail-closed run.");
  const promotion = requireRunEvidence(path.join(runDirectory, "promotion-attempt.json"), "Promotion prohibition");
  const promotionWasAttempted = promotion.value.providerCommandInvoked === true || Boolean(promotion.value.attemptedAt && promotion.value.deploymentIdentifier) || fs.existsSync(path.join(runDirectory, "promotion-result.json"));
  if (!promotionWasAttempted && (promotion.value.runId !== authority.runId || promotion.value.promotionPermanentlyProhibited !== true || promotion.value.providerCommandInvoked !== false)) throw new Error("Terminal run is not permanently prohibited from promotion.");

  let reference;
  let progress;
  let originalHistoricalReferenceSha256 = null;
  const attemptPath = path.join(runDirectory, "fresh-recapture-attempt.json");
  if (fs.existsSync(attemptPath)) {
    const attempt = requireRunEvidence(attemptPath, "Terminal recapture attempt");
    if (attempt.value.runId !== authority.runId || attempt.value.attemptId !== authority.runId + ":fresh-rollback-recapture") throw new Error("Terminal recapture attempt belongs to another run.");
    validateHistoricalRecapture(runDirectory, attempt.value);
    const historicalReferencePath = path.join(runDirectory, attempt.value.historical.reference.path);
    const historicalProgressPath = path.join(runDirectory, attempt.value.historical.progress.path);
    reference = requireRunEvidence(historicalReferencePath, "Preserved historical rollback reference");
    progress = requireRunEvidence(historicalProgressPath, "Preserved historical rollback progress");
    if (reference.sha256 !== attempt.value.historical.reference.sha256 || progress.sha256 !== attempt.value.historical.progress.sha256) throw new Error("Preserved terminal rollback identities changed.");
    originalHistoricalReferenceSha256 = reference.sha256;
  } else {
    reference = requireRunEvidence(path.join(runDirectory, "rollback-reference.json"), "Preserved rollback reference");
    progress = requireRunEvidence(path.join(runDirectory, "rollback-capture-progress.json"), "Preserved rollback progress");
  }
  validateRollbackReference(reference.value, authority, "Preserved terminal rollback reference");
  validateRollbackProgress(progress.value, authority, reference.value);
  return { mode: "terminal-preserved", terminal, promotionWasAttempted, reference, progress, verification: null, originalHistoricalReferenceSha256 };
}

function resolveFinalRollbackEvidence(runDirectory, authority, currentMs) {
  if (fs.existsSync(path.join(runDirectory, "terminal-record.json"))) return consumePreservedTerminalRollback(runDirectory, authority);
  const fresh = consumeFreshRollbackRecapture(runDirectory, authority, currentMs);
  return { mode: "fresh-verified", terminal: null, promotionWasAttempted: true, originalHistoricalReferenceSha256: fresh.verification.value.historical.reference.sha256, ...fresh };
}

function inventoryPath(runDirectory) { return path.join(runDirectory, "created-resources.json"); }

function validateResourceInventory(inventory, authority) {
  if (inventory?.schemaVersion !== 2 || inventory.runId !== authority.runId || inventory.sourceCommit !== authority.sourceCommit || inventory.sourceManifestSha256 !== authority.sourceManifestSha256 || inventory.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || !Array.isArray(inventory.resources) || !Array.isArray(inventory.unexpectedResources) || !Number.isInteger(inventory.deploymentAttemptCount) || inventory.deploymentAttemptCount < 0 || inventory.deploymentAttemptCount > 1) throw new Error("Created-resource inventory binding is invalid.");
  const identities = [...inventory.resources, ...inventory.unexpectedResources].map(resourceIdentity);
  if (identities.some(value => !value) || new Set(identities).size !== identities.length) throw new Error("Created-resource inventory contains invalid or duplicate identities.");
  return inventory;
}

function preserveInventoryRevision(runDirectory, inventory) {
  const bytes = Buffer.from(canonical(inventory));
  const digest = sha256(bytes);
  const file = path.join(runDirectory, "resource-inventory-history", digest + ".json");
  if (!fs.existsSync(file)) writeExclusive(file, bytes);
  else if (sha256(fs.readFileSync(file)) !== digest) throw new Error("Resource inventory history collision.");
  return { path: relativeToRun(runDirectory, file), sha256: digest, bytes: bytes.length };
}

export function initializeResourceInventory({ runDirectory, authority, capturedAt }) {
  const value = { schemaVersion: 2, runId: authority.runId, sourceCommit: authority.sourceCommit, sourceManifestSha256: authority.sourceManifestSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, state: "INITIALIZED", createdAt: capturedAt, updatedAt: capturedAt, deploymentAttemptCount: 0, previousRevision: null, resources: [], unexpectedResources: [] };
  writeExclusive(inventoryPath(runDirectory), value);
  return value;
}

export function beginSingleDeploymentAttempt({ runDirectory, authority, capturedAt }) {
  const record = requireRunEvidence(inventoryPath(runDirectory), "Created-resource inventory");
  const inventory = validateResourceInventory(record.value, authority);
  if (inventory.state !== "INITIALIZED" || inventory.deploymentAttemptCount !== 0 || inventory.resources.length || inventory.unexpectedResources.length) throw new Error("A clean initialized inventory is required before the one deployment attempt.");
  const marker = { schemaVersion: 1, runId: authority.runId, attemptedAt: capturedAt, state: "PROVIDER_COMMAND_AUTHORIZED", providerCommandInvoked: true, deploymentRetryPermitted: false, inventoryBeforeSha256: record.sha256 };
  writeExclusive(path.join(runDirectory, "deployment-attempt.json"), marker);
  const previousRevision = preserveInventoryRevision(runDirectory, inventory);
  atomicWrite(inventoryPath(runDirectory), { ...inventory, state: "DEPLOYMENT_IN_PROGRESS", updatedAt: capturedAt, deploymentAttemptCount: 1, previousRevision });
  return marker;
}

export function registerSingleDeployment({ runDirectory, authority, capturedAt }) {
  const marker = requireRunEvidence(path.join(runDirectory, "deployment-attempt.json"), "Deployment attempt");
  const inventoryRecord = requireRunEvidence(inventoryPath(runDirectory), "Created-resource inventory");
  const inventory = validateResourceInventory(inventoryRecord.value, authority);
  if (marker.value.runId !== authority.runId || marker.value.providerCommandInvoked !== true || marker.value.deploymentRetryPermitted !== false || inventory.state !== "DEPLOYMENT_IN_PROGRESS" || inventory.deploymentAttemptCount !== 1) throw new Error("Single deployment attempt state is invalid.");
  const deployment = requireRunEvidence(path.join(runDirectory, "immutable-deployment.json"), "Immutable deployment");
  const value = deployment.value;
  if (!value.deploymentIdentifier || !value.url || REJECTED_DEPLOYMENTS.includes(value.deploymentIdentifier) || value.sourceCommit !== authority.sourceCommit || value.sourceManifestSha256 !== authority.sourceManifestSha256 || value.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || value.aliasAssigned !== false) throw new Error("Provider-returned immutable deployment evidence is invalid.");
  const previousRevision = preserveInventoryRevision(runDirectory, inventory);
  const resource = { type: "immutable-deployment", id: value.deploymentIdentifier, provider: "expo-eas-hosting", url: value.url, createdByRun: true, evidence: { path: relativeToRun(runDirectory, deployment.file), sha256: deployment.sha256, bytes: fs.statSync(deployment.file).size } };
  const next = { ...inventory, state: "DEPLOYMENT_REGISTERED", updatedAt: capturedAt, previousRevision, resources: [resource] };
  atomicWrite(inventoryPath(runDirectory), next);
  atomicWrite(path.join(runDirectory, "deployment-attempt.json"), { ...marker.value, state: "CONFIRMED", confirmedAt: capturedAt, deploymentIdentifier: value.deploymentIdentifier, deploymentEvidenceSha256: deployment.sha256 });
  return next;
}

export function recordDeploymentUncertainty({ runDirectory, authority, capturedAt, reason }) {
  required(reason, "Deployment uncertainty reason");
  const marker = requireRunEvidence(path.join(runDirectory, "deployment-attempt.json"), "Deployment attempt");
  const inventoryRecord = requireRunEvidence(inventoryPath(runDirectory), "Created-resource inventory");
  const inventory = validateResourceInventory(inventoryRecord.value, authority);
  if (marker.value.providerCommandInvoked !== true || inventory.state !== "DEPLOYMENT_IN_PROGRESS") throw new Error("Deployment uncertainty can only follow the one provider attempt.");
  const previousRevision = preserveInventoryRevision(runDirectory, inventory);
  const unexpected = { type: "provider-deployment-attempt", id: authority.runId + ":single-attempt", provider: "expo-eas-hosting", status: "IDENTITY_UNCERTAIN", reason: sanitizeSupportError(new Error(reason)) };
  const next = { ...inventory, state: "DEPLOYMENT_UNCERTAIN", updatedAt: capturedAt, previousRevision, unexpectedResources: [unexpected] };
  atomicWrite(inventoryPath(runDirectory), next);
  atomicWrite(path.join(runDirectory, "deployment-attempt.json"), { ...marker.value, state: "UNCERTAIN", uncertainAt: capturedAt, reason: unexpected.reason });
  return next;
}

export async function produceDeploymentReconciliationEvidence({ runDirectory, authority, capturedAt, fetchImpl = fetch, expoSession }) {
  const marker = requireRunEvidence(path.join(runDirectory, "deployment-attempt.json"), "Deployment attempt");
  const inventory = requireRunEvidence(inventoryPath(runDirectory), "Created-resource inventory");
  if (marker.value.state !== "UNCERTAIN" || marker.value.runId !== authority.runId || inventory.value.state !== "DEPLOYMENT_UNCERTAIN") throw new Error("Independent provider read is permitted only for the uncertain single deployment attempt.");
  if (!expoSession) throw new Error("Expo session is unavailable for read-only deployment reconciliation.");
  const output = path.join(runDirectory, "provider-deployment-reconciliation.json");
  if (fs.existsSync(output)) throw new Error("Provider reconciliation evidence already exists; overwrite prohibited.");
  const startedAt = capturedAt || new Date().toISOString();
  const requestId = authority.runId + ":provider-deployment-reconciliation:1";
  const query = "query Deployments($appId:String!){app{byId(appId:$appId){id workerDeployments(first:50){edges{node{id deploymentIdentifier url createdAt}}}}}}";
  let row;
  try {
    const response = await fetchImpl("https://api.expo.dev/graphql", { method: "POST", headers: { "content-type": "application/json", "expo-session": expoSession }, body: JSON.stringify({ query, variables: { appId: DIAGNOSTIC_OPERATOR.easProjectId } }) });
    const body = await response.json();
    const app = body.data?.app?.byId, deployments = app?.workerDeployments?.edges?.map(edge => edge.node) || [];
    const payload = { attemptId: authority.runId + ":single-deployment-attempt", easProjectId: app?.id || null, endpoint: "https://api.expo.dev/graphql", deployments: deployments.map(value => ({ deploymentIdentifier: value.deploymentIdentifier, url: value.url, createdAt: value.createdAt })) };
    row = { schemaVersion: 2, runId: authority.runId, stage: "deployment-reconciliation", requestId, startedAt, completedAt: new Date().toISOString(), status: response.status, payloadSha256: sha256(Buffer.from(canonical(payload))), payload, error: body.errors ? "PROVIDER_GRAPHQL_ERROR" : null };
    writeExclusive(output, row);
    if (response.status !== 200 || body.errors || app?.id !== DIAGNOSTIC_OPERATOR.easProjectId) throw new Error("Independent provider deployment read failed or returned the wrong EAS project.");
  } catch (error) {
    if (!fs.existsSync(output)) writeExclusive(output, { schemaVersion: 2, runId: authority.runId, stage: "deployment-reconciliation", requestId, startedAt, completedAt: new Date().toISOString(), status: null, payloadSha256: null, payload: null, error: sanitizeSupportError(error) });
    throw error;
  }
  return { path: output, sha256: sha256(fs.readFileSync(output)), deployments: row.payload.deployments.length };
}

export function reconcileDeploymentObservation({ runDirectory, authority, observationPath, capturedAt }) {
  const marker = requireRunEvidence(path.join(runDirectory, "deployment-attempt.json"), "Deployment attempt");
  const inventoryRecord = requireRunEvidence(inventoryPath(runDirectory), "Created-resource inventory");
  const inventory = validateResourceInventory(inventoryRecord.value, authority);
  if (marker.value.state !== "UNCERTAIN" || inventory.state !== "DEPLOYMENT_UNCERTAIN" || marker.value.providerCommandInvoked !== true) throw new Error("Only an uncertain one-time deployment attempt may be reconciled.");
  relativeToRun(runDirectory, observationPath);
  const observationRecord = requireRunEvidence(observationPath, "Provider deployment reconciliation");
  const row = observationRecord.value;
  exactKeys(row, ["schemaVersion", "runId", "stage", "requestId", "startedAt", "completedAt", "status", "payloadSha256", "payload", "error"], "Provider deployment reconciliation");
  if (row.schemaVersion !== 2 || row.runId !== authority.runId || row.stage !== "deployment-reconciliation" || row.status !== 200 || !row.requestId || row.payloadSha256 !== sha256(Buffer.from(canonical(row.payload))) || !Number.isFinite(Date.parse(row.startedAt)) || !Number.isFinite(Date.parse(row.completedAt)) || Date.parse(row.completedAt) < Date.parse(row.startedAt)) throw new Error("Independent provider deployment observation is invalid.");
  exactKeys(row.payload, ["attemptId", "easProjectId", "endpoint", "deployments"], "Provider deployment payload");
  if (row.error !== null || row.payload.attemptId !== authority.runId + ":single-deployment-attempt" || row.payload.easProjectId !== DIAGNOSTIC_OPERATOR.easProjectId || row.payload.endpoint !== "https://api.expo.dev/graphql" || !Array.isArray(row.payload.deployments)) throw new Error("Provider deployment observation is bound to another attempt.");
  const deployments = row.payload.deployments;
  const ids = deployments.map(value => value?.deploymentIdentifier);
  if (ids.some(value => !value) || new Set(ids).size !== ids.length || deployments.some(value => value.url !== `https://hungrie-restaurant--${value.deploymentIdentifier}.expo.app` || !Number.isFinite(Date.parse(value.createdAt || "")) || REJECTED_DEPLOYMENTS.includes(value.deploymentIdentifier))) throw new Error("Provider deployment observation contains invalid identities.");
  const attemptedMs = Date.parse(marker.value.attemptedAt);
  const candidates = deployments.filter(value => Date.parse(value.createdAt) >= attemptedMs - 5_000 && Date.parse(value.createdAt) <= Date.parse(row.completedAt));
  const previousRevision = preserveInventoryRevision(runDirectory, inventory);
  if (candidates.length !== 1) {
    const unexpectedResources = candidates.length ? candidates.map(value => ({ type: "immutable-deployment", id: value.deploymentIdentifier, provider: "expo-eas-hosting", url: value.url, status: "AMBIGUOUS_PROVIDER_RECONCILIATION", evidenceSha256: observationRecord.sha256 })) : inventory.unexpectedResources;
    const next = { ...inventory, state: candidates.length ? "DEPLOYMENT_RECONCILIATION_AMBIGUOUS" : "DEPLOYMENT_RECONCILED_NO_RESOURCE", updatedAt: capturedAt, previousRevision, unexpectedResources };
    atomicWrite(inventoryPath(runDirectory), next);
    atomicWrite(path.join(runDirectory, "deployment-attempt.json"), { ...marker.value, state: next.state, reconciledAt: capturedAt, observationSha256: observationRecord.sha256 });
    return next;
  }
  const candidate = candidates[0];
  const deployment = { capturedAt: candidate.createdAt, deploymentIdentifier: candidate.deploymentIdentifier, url: candidate.url, sourceCommit: authority.sourceCommit, sourceManifestSha256: authority.sourceManifestSha256, artifactManifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, aliasAssigned: false, reconciledFromProviderRead: true, providerObservationSha256: observationRecord.sha256 };
  const deploymentPath = path.join(runDirectory, "immutable-deployment.json");
  if (fs.existsSync(deploymentPath)) throw new Error("Immutable deployment evidence already exists; reconciliation overwrite prohibited.");
  writeExclusive(deploymentPath, deployment);
  const deploymentEvidence = fileIdentity(runDirectory, deploymentPath);
  const resource = { type: "immutable-deployment", id: candidate.deploymentIdentifier, provider: "expo-eas-hosting", url: candidate.url, createdByRun: true, evidence: deploymentEvidence };
  const next = { ...inventory, state: "DEPLOYMENT_REGISTERED", updatedAt: capturedAt, previousRevision, resources: [resource], unexpectedResources: [] };
  atomicWrite(inventoryPath(runDirectory), next);
  atomicWrite(path.join(runDirectory, "deployment-attempt.json"), { ...marker.value, state: "RECONCILED_CONFIRMED", reconciledAt: capturedAt, deploymentIdentifier: candidate.deploymentIdentifier, deploymentEvidenceSha256: deploymentEvidence.sha256, observationSha256: observationRecord.sha256 });
  return next;
}

function consumeRegisteredDeployment(runDirectory, authority, deployment) {
  const record = requireRunEvidence(inventoryPath(runDirectory), "Created-resource inventory");
  const inventory = validateResourceInventory(record.value, authority);
  const marker = requireRunEvidence(path.join(runDirectory, "deployment-attempt.json"), "Deployment attempt");
  const resource = inventory.resources.find(row => row.type === "immutable-deployment" && row.id === deployment.value.deploymentIdentifier);
  if (!['CONFIRMED', 'RECONCILED_CONFIRMED'].includes(marker.value.state) || marker.value.runId !== authority.runId || marker.value.providerCommandInvoked !== true || marker.value.deploymentRetryPermitted !== false || marker.value.deploymentIdentifier !== deployment.value.deploymentIdentifier || marker.value.deploymentEvidenceSha256 !== deployment.sha256 || inventory.state !== "DEPLOYMENT_REGISTERED" || inventory.deploymentAttemptCount !== 1 || inventory.resources.length !== 1 || inventory.unexpectedResources.length || !resource || resource.evidence?.sha256 !== deployment.sha256) throw new Error("Exactly one confirmed registered provider deployment is required.");
  return record;
}

export function buildCleanupDisposition({ runDirectory, authority, capturedAt }) {
  const record = requireRunEvidence(inventoryPath(runDirectory), "Created-resource inventory");
  const inventory = validateResourceInventory(record.value, authority);
  const createdResources = inventory.resources.map(row => ({ type: row.type, id: row.id, disposition: row.type === "immutable-deployment" ? "retained-provider-record" : "incomplete", verificationEvidence: row.evidence || null }));
  const incomplete = [];
  const terminalPreDeployment = fs.existsSync(path.join(runDirectory, "terminal-record.json")) && inventory.state === "INITIALIZED" && inventory.deploymentAttemptCount === 0 && inventory.resources.length === 0 && inventory.unexpectedResources.length === 0;
  if (inventory.state !== "DEPLOYMENT_REGISTERED" && !terminalPreDeployment) incomplete.push("RESOURCE_INVENTORY_NOT_REGISTERED");
  if (inventory.unexpectedResources.length) incomplete.push("UNEXPECTED_RESOURCES_REQUIRE_SEPARATE_RECONCILIATION");
  if (createdResources.some(row => row.disposition === "incomplete")) incomplete.push("UNSUPPORTED_RESOURCE_DISPOSITION");
  const value = { schemaVersion: 2, runId: authority.runId, capturedAt, manifestScoped: true, inventorySha256: record.sha256, createdResources, unexpectedResources: inventory.unexpectedResources, incomplete, passed: incomplete.length === 0 };
  writeExclusive(path.join(runDirectory, "cleanup-disposition.json"), value);
  return value;
}

export function buildExpectedFinalAliasReference({ runDirectory, authority, capturedAt }) {
  const rollbackEvidence = resolveFinalRollbackEvidence(runDirectory, authority, Date.parse(capturedAt));
  const reference = rollbackEvidence.reference.value;
  const promotionResultExists = fs.existsSync(path.join(runDirectory, "promotion-result.json"));
  let rollbackVerificationSha256 = null;
  if (fs.existsSync(path.join(runDirectory, "rollback-verification-result.json"))) {
    const verified = requireRunEvidence(path.join(runDirectory, "rollback-verification-result.json"), "Independent rollback verification");
    if (verified.value.passed !== true || verified.value.classification !== "PASS" || verified.value.expected?.deploymentIdentifier !== reference.deploymentIdentifier || JSON.stringify(verified.value.expected.routes) !== JSON.stringify(reference.routes) || JSON.stringify(verified.value.expected.criticalAssets) !== JSON.stringify(reference.criticalAssets) || JSON.stringify(verified.value.expected.runtimeFiles) !== JSON.stringify(reference.runtimeFiles) || JSON.stringify(verified.value.expected.externalRuntime) !== JSON.stringify(reference.externalRuntime) || verified.value.selectedAttempts?.length < 2) throw new Error("Independent rollback verification does not match the frozen reference.");
    rollbackVerificationSha256 = verified.sha256;
  }
  if ((promotionResultExists || rollbackEvidence.terminal?.value.rollbackRequired === true) && !rollbackVerificationSha256) throw new Error("A changed or uncertain alias requires independent rollback verification before final reconciliation.");
  const value = { schemaVersion: 1, runId: authority.runId, capturedAt, deploymentIdentifier: reference.deploymentIdentifier, deploymentUrl: reference.deploymentUrl, routes: reference.routes, criticalAssets: reference.criticalAssets, runtimeFiles: reference.runtimeFiles, externalRuntime: reference.externalRuntime, contractSha256: reference.contractSha256, source: { mode: rollbackEvidence.mode, rollbackReferenceSha256: rollbackEvidence.reference.sha256, rollbackProgressSha256: rollbackEvidence.progress.sha256, freshRecaptureVerificationSha256: rollbackEvidence.verification?.sha256 || null, originalHistoricalReferenceSha256: rollbackEvidence.originalHistoricalReferenceSha256, terminalRecordSha256: rollbackEvidence.terminal?.sha256 || null, rollbackVerificationSha256 } };
  writeExclusive(path.join(runDirectory, "expected-final-alias-reference.json"), value);
  return value;
}

export function buildBaselinePreflight({ authority, reads, protectedEvidence, capturedAt }) {
  if (authority.runId !== SUPPORT.runId || !/^[a-f0-9]{40}$/.test(authority.sourceCommit || "") || !/^[a-f0-9]{64}$/.test(authority.sourceManifestSha256 || "") || authority.applicationTree !== SUPPORT.applicationTree) throw new Error("Baseline authority mismatch.");
  const snapshot = validateSnapshotReads(reads, "baseline", { runId: authority.runId, stage: "baseline-preflight", capturedAt, maximumAgeMs: SUPPORT.freshnessMs.baseline });
  if (!Array.isArray(protectedEvidence) || protectedEvidence.some(value => value.passed !== true) || protectedEvidence.length !== 2) throw new Error("Protected evidence verification required.");
  return {
    schemaVersion: 1, stage: "baseline", passed: true, capturedAt, runId: authority.runId,
    source: { commit: authority.sourceCommit, manifestSha256: authority.sourceManifestSha256, applicationTree: SUPPORT.applicationTree },
    artifact: { manifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256 },
    protectedEvidence, ...snapshot,
  };
}

export function buildFinalPreflight({ authority, reads, protectedEvidence, runDirectory, capturedAt, currentMs = Date.now() }) {
  const snapshot = validateSnapshotReads(reads, "final", { runId: authority.runId, stage: "promotion-preflight", capturedAt, maximumAgeMs: SUPPORT.freshnessMs.final });
  const artifact = requireRunEvidence(path.join(runDirectory, "artifact-manifest.json"), "Artifact");
  const deployment = requireRunEvidence(path.join(runDirectory, "immutable-deployment.json"), "Deployment");
  const immutable = requireRunEvidence(path.join(runDirectory, "immutable-smoke.json"), "Immutable parity");
  const access = requireRunEvidence(path.join(runDirectory, "immutable-access-qualification.json"), "Immutable access");
  const fresh = consumeFreshRollbackRecapture(runDirectory, authority, currentMs);
  const rollback = fresh.reference;
  if (artifact.value.runId !== authority.runId || artifact.value.sourceCommit !== authority.sourceCommit || artifact.value.sourceManifestSha256 !== authority.sourceManifestSha256 || artifact.value.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || artifact.value.archiveSha256 !== DIAGNOSTIC_OPERATOR.archiveSha256) throw new Error("Final artifact binding mismatch.");
  if (!deployment.value.deploymentIdentifier || deployment.value.url !== immutable.value.url || immutable.value.passed !== true || immutable.value.deploymentIdentifier !== deployment.value.deploymentIdentifier) throw new Error("Final immutable candidate mismatch.");
  const resourceInventory = consumeRegisteredDeployment(runDirectory, authority, deployment);
  if (access.value.passed !== true || access.value.deploymentIdentifier !== deployment.value.deploymentIdentifier || access.value.immutableUrl !== deployment.value.url || access.value.immutableEvidenceSha256 !== immutable.sha256) throw new Error("Final access evidence mismatch.");
  if (rollback.value.passed !== true || rollback.value.deploymentIdentifier !== DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment) throw new Error("Final rollback identity mismatch.");
  const rollbackMs = Date.parse(rollback.value.capturedAt || "");
  if (!Number.isFinite(rollbackMs) || rollbackMs > currentMs + 5_000 || currentMs - rollbackMs > SUPPORT.freshnessMs.rollback) {
    const error = new Error("Rollback reference is stale; fresh independent recapture is required before final preflight.");
    error.code = "ROLLBACK_RECAPTURE_REQUIRED";
    throw error;
  }
  if (snapshot.alias.deploymentIdentifier !== rollback.value.deploymentIdentifier) throw new Error("Live alias no longer matches the frozen rollback reference.");
  if (!Array.isArray(protectedEvidence) || protectedEvidence.some(value => value.passed !== true) || protectedEvidence.length !== 2) throw new Error("Protected evidence verification required.");
  return {
    schemaVersion: 1,
    passed: true,
    capturedAt,
    runId: authority.runId,
    environment: "staging",
    identities: snapshot.identities,
    source: { commit: authority.sourceCommit, manifestSha256: authority.sourceManifestSha256, applicationTree: SUPPORT.applicationTree },
    artifact: { manifestSha256: DIAGNOSTIC_OPERATOR.artifactManifestSha256, archiveSha256: DIAGNOSTIC_OPERATOR.archiveSha256 },
    migration: snapshot.migration,
    earnings: snapshot.earnings,
    protectedEvidence,
    candidate: { deploymentIdentifier: deployment.value.deploymentIdentifier, url: deployment.value.url, immutableEvidenceSha256: immutable.sha256, accessEvidenceSha256: access.sha256 },
    rollback: { deploymentIdentifier: rollback.value.deploymentIdentifier, referenceSha256: rollback.sha256, parityPassed: true, freshRecaptureVerificationSha256: fresh.verification.sha256, originalHistoricalReferenceSha256: fresh.verification.value.historical.reference.sha256 },
    resourceInventory: { sha256: resourceInventory.sha256, state: resourceInventory.value.state, deploymentAttemptCount: resourceInventory.value.deploymentAttemptCount },
    observationEvidence: Object.fromEntries(Object.entries(snapshot.observations).map(([name, row]) => [name, { requestId: row.requestId, payloadSha256: row.payloadSha256, completedAt: row.completedAt }])),
  };
}

export function recordTerminalState({ runDirectory, authority, classification, reason, capturedAt, write = atomicWrite }) {
  if (!["FAIL", "INCONCLUSIVE", "ABORTED"].includes(classification)) throw new Error("Terminal failure classification required.");
  required(reason, "Terminal reason");
  const promotionAttempt = path.join(runDirectory, "promotion-attempt.json");
  const promotionResult = path.join(runDirectory, "promotion-result.json");
  const rollbackResult = path.join(runDirectory, "rollback-result.json");
  const rollbackVerification = path.join(runDirectory, "rollback-verification-result.json");
  const attempt = fs.existsSync(promotionAttempt) ? JSON.parse(fs.readFileSync(promotionAttempt, "utf8")) : null;
  const providerCommandInvoked = fs.existsSync(promotionResult) || attempt?.providerCommandInvoked === true || (Boolean(attempt?.attemptedAt) && Boolean(attempt?.deploymentIdentifier));
  const assignment = fs.existsSync(promotionResult) ? "confirmed" : providerCommandInvoked ? "uncertain" : "not-attempted";
  const rollbackRequired = assignment !== "not-attempted";
  if (!fs.existsSync(promotionAttempt)) atomicWrite(promotionAttempt, { blockedAt: capturedAt, runId: authority.runId, providerCommandInvoked: false, promotionPermanentlyProhibited: true, reason: classification + ": " + reason });
  const value = {
    schemaVersion: 1, capturedAt, runId: authority.runId, classification, reason,
    aliasAssignment: assignment, rollbackRequired, promotionRetryPermitted: false,
    rollbackCommand: rollbackRequired ? "node scripts/deploy-restaurant-alias-10-minute-diagnostic-staging.mjs rollback --environment=staging --run-id=" + authority.runId + " --confirm=staging:restaurant-alias-diagnostic:rollback:" + authority.runId + " <reviewed authority/source arguments>" : null,
    restorationVerified: fs.existsSync(rollbackVerification) ? JSON.parse(fs.readFileSync(rollbackVerification, "utf8")).passed === true : fs.existsSync(rollbackResult) ? false : null,
    preservedEvidence: fs.readdirSync(runDirectory).sort(),
  };
  const output = path.join(runDirectory, "terminal-record.json");
  if (fs.existsSync(output)) throw new Error("Terminal record already exists; overwrite prohibited.");
  write(output, value);
  return value;
}

function credentialFindings(directory) {
  const patterns = [
    /bearer\s+[a-z0-9._~+/=-]{12,}/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\./,
    /"(?:password|cookie|sessionSecret|apiKey|authorization)"\s*:\s*"(?!(?:\[REDACTED\]|<REDACTED>))[^"]+"/i,
  ];
  const findings = [];
  for (const file of walk(directory)) {
    if (path.basename(file) === "evidence-manifest.tsv") continue;
    const body = fs.readFileSync(file);
    if (body.includes(0)) continue;
    const text = body.toString("utf8");
    if (patterns.some(pattern => pattern.test(text))) findings.push(path.relative(directory, file).split(path.sep).join("/"));
  }
  return findings;
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}

export function buildEvidenceManifest(directory) {
  const files = walk(directory).filter(file => path.basename(file) !== "evidence-manifest.tsv").sort();
  const bytes = Buffer.from(files.map(file => {
    const data = fs.readFileSync(file);
    return sha256(data) + "\t" + data.length + "\t" + path.relative(directory, file).split(path.sep).join("/") + "\n";
  }).join(""));
  return { files: files.length, bytes, sha256: sha256(bytes) };
}

function reconcileProtectedEvidence(rows, error = null) {
  const expected = DIAGNOSTIC_OPERATOR.protectedEvidence;
  const issues = [];
  if (error) issues.push("VERIFICATION_ERROR");
  if (!Array.isArray(rows) || rows.length !== expected.length) issues.push("INCOMPLETE_RESULT_SET");
  for (const reference of expected) {
    const matches = Array.isArray(rows) ? rows.filter(row => row?.runId === reference.runId) : [];
    if (matches.length !== 1) { issues.push("RUN_RESULT_MISSING_OR_DUPLICATED:" + reference.runId); continue; }
    const row = matches[0];
    if (row.passed !== true || row.files !== reference.files || row.manifestSha256 !== reference.manifestSha256) issues.push("RUN_RESULT_MISMATCH:" + reference.runId);
  }
  return { passed: issues.length === 0, expectedFiles: expected.reduce((sum, row) => sum + row.files, 0), results: Array.isArray(rows) ? rows : [], issues, error: error ? sanitizeSupportError(error) : null };
}

function resourceIdentity(value) {
  return value && typeof value.type === "string" && value.type && typeof value.id === "string" && value.id ? value.type + ":" + value.id : null;
}

function reconcileCleanup(runDirectory, authority, cleanup) {
  const issues = [];
  let inventory = null;
  try { inventory = JSON.parse(fs.readFileSync(path.join(runDirectory, "created-resources.json"), "utf8")); }
  catch (error) { issues.push("CREATED_RESOURCE_INVENTORY_MISSING_OR_INVALID"); }
  const resources = Array.isArray(inventory?.resources) ? inventory.resources : [];
  const unexpected = Array.isArray(inventory?.unexpectedResources) ? inventory.unexpectedResources : [];
  const terminalNoDeployment = fs.existsSync(path.join(runDirectory, "terminal-record.json")) && inventory?.state === "INITIALIZED" && inventory?.deploymentAttemptCount === 0 && resources.length === 0 && unexpected.length === 0;
  if (inventory?.schemaVersion !== 2 || inventory?.runId !== authority.runId || inventory?.sourceCommit !== authority.sourceCommit || inventory?.sourceManifestSha256 !== authority.sourceManifestSha256 || inventory?.artifactManifestSha256 !== DIAGNOSTIC_OPERATOR.artifactManifestSha256 || (inventory?.deploymentAttemptCount !== 1 && !terminalNoDeployment) || !Array.isArray(inventory?.resources) || !Array.isArray(inventory?.unexpectedResources)) issues.push("CREATED_RESOURCE_INVENTORY_BINDING_INVALID");
  const inventoryBytes = fs.existsSync(path.join(runDirectory, "created-resources.json")) ? fs.readFileSync(path.join(runDirectory, "created-resources.json")) : null;
  if (cleanup?.schemaVersion !== 2 || cleanup?.runId !== authority.runId || cleanup?.inventorySha256 !== (inventoryBytes ? sha256(inventoryBytes) : null) || cleanup?.passed !== true) issues.push("CLEANUP_BINDING_INVALID");
  const inventoryIds = resources.map(resourceIdentity);
  if (inventoryIds.some(value => !value) || new Set(inventoryIds).size !== inventoryIds.length) issues.push("CREATED_RESOURCE_INVENTORY_DUPLICATE_OR_INVALID");
  const cleanupRows = Array.isArray(cleanup?.createdResources) ? cleanup.createdResources : [];
  const cleanupIds = cleanupRows.map(resourceIdentity);
  if (cleanupIds.some(value => !value) || new Set(cleanupIds).size !== cleanupIds.length) issues.push("CLEANUP_RESOURCE_DUPLICATE_OR_INVALID");
  const supported = new Set(["retained-provider-record", "deleted-and-verified", "unregistered-and-verified"]);
  if (cleanupRows.some(row => !supported.has(row?.disposition))) issues.push("CLEANUP_DISPOSITION_UNSUPPORTED_OR_INCOMPLETE");
  for (const row of cleanupRows.filter(value => ["deleted-and-verified", "unregistered-and-verified"].includes(value?.disposition))) {
    const relative = row.verificationEvidence?.path;
    const expectedSha256 = row.verificationEvidence?.sha256;
    const evidencePath = typeof relative === "string" ? path.resolve(runDirectory, relative) : "";
    if (!relative || !/^[a-f0-9]{64}$/.test(expectedSha256 || "") || !evidencePath.startsWith(path.resolve(runDirectory) + path.sep) || !fs.existsSync(evidencePath) || sha256(fs.readFileSync(evidencePath)) !== expectedSha256) issues.push("CLEANUP_DELETION_CLAIM_UNVERIFIED:" + (resourceIdentity(row) || "invalid"));
  }
  if (JSON.stringify([...inventoryIds].sort()) !== JSON.stringify([...cleanupIds].sort())) issues.push("CLEANUP_RESOURCE_SET_MISMATCH");
  const persistedUnexpected = unexpected.map(resourceIdentity);
  const declaredUnexpected = Array.isArray(cleanup?.unexpectedResources) ? cleanup.unexpectedResources.map(resourceIdentity) : [];
  if (persistedUnexpected.some(value => !value) || new Set(persistedUnexpected).size !== persistedUnexpected.length || declaredUnexpected.some(value => !value) || new Set(declaredUnexpected).size !== declaredUnexpected.length || JSON.stringify([...persistedUnexpected].sort()) !== JSON.stringify([...declaredUnexpected].sort())) issues.push("UNEXPECTED_RESOURCE_RECONCILIATION_MISMATCH");
  if (unexpected.length) issues.push("UNEXPECTED_RESOURCES_REMAIN");
  if (cleanup?.manifestScoped !== true || !Array.isArray(cleanup?.incomplete) || cleanup.incomplete.length) issues.push("CLEANUP_INCOMPLETE");
  const deploymentPath = path.join(runDirectory, "immutable-deployment.json");
  if (resources.length === 0 && cleanupRows.length === 0) {
    if (fs.existsSync(deploymentPath) || inventory?.deploymentAttemptCount !== 0 || inventory?.state !== "INITIALIZED") issues.push("EMPTY_RESOURCE_INVENTORY_INCONSISTENT");
  } else try {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    if (!deployment.deploymentIdentifier || !resources.some(row => row.type === "immutable-deployment" && row.id === deployment.deploymentIdentifier) || !cleanupRows.some(row => row.type === "immutable-deployment" && row.id === deployment.deploymentIdentifier && row.disposition === "retained-provider-record")) issues.push("IMMUTABLE_PROVIDER_DEPLOYMENT_UNACCOUNTED");
  } catch (error) { issues.push("IMMUTABLE_DEPLOYMENT_EVIDENCE_INVALID"); }
  return { passed: issues.length === 0, inventory, cleanup, issues };
}

export async function finalizeRun({ root, runDirectory, authority, expectedAlias, readers, cleanup, capturedAt, persist = atomicWrite, verifyProtectedEvidenceImpl = verifyProtectedEvidence }) {
  if (expectedAlias?.schemaVersion !== 1 || expectedAlias.runId !== authority.runId || expectedAlias.deploymentIdentifier !== DIAGNOSTIC_OPERATOR.lastVerifiedRollbackDeployment || expectedAlias.routes?.length !== SUPPORT.rollbackContract.routes || !expectedAlias.criticalAssets?.length || expectedAlias.runtimeFiles?.length !== 3 || expectedAlias.externalRuntime?.length !== 2) throw new Error("Complete run-bound final alias reference required.");
  const expectedRecord = requireRunEvidence(path.join(runDirectory, "expected-final-alias-reference.json"), "Expected final alias reference");
  if (expectedRecord.sha256 !== sha256(Buffer.from(canonical(expectedAlias)))) throw new Error("Expected final alias input differs from persisted evidence.");
  const rollbackEvidence = resolveFinalRollbackEvidence(runDirectory, authority, Date.parse(capturedAt));
  if (expectedAlias.source?.mode !== rollbackEvidence.mode || expectedAlias.source?.rollbackReferenceSha256 !== rollbackEvidence.reference.sha256 || expectedAlias.source?.rollbackProgressSha256 !== rollbackEvidence.progress.sha256 || expectedAlias.source?.freshRecaptureVerificationSha256 !== (rollbackEvidence.verification?.sha256 || null) || expectedAlias.source?.terminalRecordSha256 !== (rollbackEvidence.terminal?.sha256 || null) || JSON.stringify(expectedAlias.routes) !== JSON.stringify(rollbackEvidence.reference.value.routes) || JSON.stringify(expectedAlias.criticalAssets) !== JSON.stringify(rollbackEvidence.reference.value.criticalAssets) || JSON.stringify(expectedAlias.runtimeFiles) !== JSON.stringify(rollbackEvidence.reference.value.runtimeFiles) || JSON.stringify(expectedAlias.externalRuntime) !== JSON.stringify(rollbackEvidence.reference.value.externalRuntime) || expectedAlias.contractSha256 !== rollbackEvidence.reference.value.contractSha256) throw new Error("Expected final alias is not derived from the required verified rollback evidence.");
  const cleanupRecord = requireRunEvidence(path.join(runDirectory, "cleanup-disposition.json"), "Cleanup disposition");
  if (cleanupRecord.sha256 !== sha256(Buffer.from(canonical(cleanup)))) throw new Error("Cleanup input differs from persisted evidence.");
  const finalizationAttempt = path.join(runDirectory, "finalization-attempt.json");
  if (!fs.existsSync(finalizationAttempt)) writeExclusive(finalizationAttempt, { schemaVersion: 1, runId: authority.runId, startedAt: capturedAt, state: "STARTED", expectedAliasSha256: expectedRecord.sha256, cleanupSha256: cleanupRecord.sha256 });
  else {
    const existing = JSON.parse(fs.readFileSync(finalizationAttempt, "utf8"));
    if (existing.runId !== authority.runId || existing.state === "COMPLETE" || existing.expectedAliasSha256 !== expectedRecord.sha256 || existing.cleanupSha256 !== cleanupRecord.sha256) throw new Error("Finalization attempt cannot be retried or rebound.");
  }
  let protectedRows = [], protectedError = null;
  try { protectedRows = verifyProtectedEvidenceImpl(root); } catch (error) { protectedError = error; }
  const protectedEvidence = reconcileProtectedEvidence(protectedRows, protectedError);
  const reads = await readers.collect();
  persist(path.join(runDirectory, "finalization-reads.json"), { schemaVersion: 1, runId: authority.runId, reads });
  const snapshot = validateSnapshotReads(reads, "finalization", { runId: authority.runId, stage: "finalization", capturedAt, maximumAgeMs: SUPPORT.freshnessMs.final });
  const aliasParity = await readers.verifyAliasParity(expectedAlias);
  const firebaseAdminLifecycle = readers.close ? await readers.close() : { state: "NOT_APPLICABLE", passed: true };
  if (firebaseAdminLifecycle?.passed !== true) throw new Error("Firebase Admin temporary app cleanup is incomplete.");
  const findings = credentialFindings(runDirectory);
  const cleanupReconciliation = reconcileCleanup(runDirectory, authority, cleanup);
  const required = ["baseline-preflight.json"];
  const promotionAttemptRecord = fs.existsSync(path.join(runDirectory, "promotion-attempt.json")) ? JSON.parse(fs.readFileSync(path.join(runDirectory, "promotion-attempt.json"), "utf8")) : null;
  const promotionAttempted = Boolean(promotionAttemptRecord?.providerCommandInvoked === true || (promotionAttemptRecord?.attemptedAt && promotionAttemptRecord?.deploymentIdentifier) || fs.existsSync(path.join(runDirectory, "promotion-result.json")));
  const terminalExists = fs.existsSync(path.join(runDirectory, "terminal-record.json"));
  if (promotionAttempted) required.push("artifact-manifest.json", "immutable-deployment.json", "immutable-smoke.json", "immutable-access-qualification.json", "promotion-preflight.json", "rollback-attempt.json");
  if (promotionAttempted && !terminalExists) required.push("promotion-result.json", "alias-observation-result.json", "alias-full-artifact-result.json", "rollback-result.json", "rollback-verification-result.json");
  if (!promotionAttempted) required.push("terminal-record.json");
  const terminalRecord = terminalExists ? JSON.parse(fs.readFileSync(path.join(runDirectory, "terminal-record.json"), "utf8")) : null;
  const terminalRollbackRequired = terminalRecord?.rollbackRequired === true;
  if (terminalRollbackRequired) required.push("rollback-attempt.json", "rollback-result.json", "rollback-verification-result.json");
  const missingEvidence = required.filter(name => !fs.existsSync(path.join(runDirectory, name)));
  let result = "PASS";
  const blockers = [];
  if (!aliasParity?.passed || aliasParity.deploymentIdentifier !== expectedAlias.deploymentIdentifier || aliasParity.selectedAttempts?.length < 2) { result = "FAIL"; blockers.push("FINAL_ALIAS_PARITY_FAILED"); }
  if (!protectedEvidence.passed) { result = "FAIL"; blockers.push("PROTECTED_EVIDENCE_FAILED"); }
  if (terminalExists) { result = "FAIL"; blockers.push("TERMINAL_NON_PASS_RUN"); }
  if ((promotionAttempted || terminalRollbackRequired) && !aliasParity?.passed) { result = "FAIL"; blockers.push("ROLLBACK_RESTORATION_NOT_VERIFIED"); }
  if (fs.existsSync(path.join(runDirectory, "rollback-verification-result.json"))) {
    const rollbackVerification = JSON.parse(fs.readFileSync(path.join(runDirectory, "rollback-verification-result.json"), "utf8"));
    if (rollbackVerification.passed !== true || rollbackVerification.classification !== "PASS" || rollbackVerification.expected?.deploymentIdentifier !== expectedAlias.deploymentIdentifier || rollbackVerification.selectedAttempts?.length < 2) { result = "FAIL"; blockers.push("RECORDED_ROLLBACK_VERIFICATION_FAILED"); }
  }
  if (missingEvidence.length) { if (result === "PASS") result = "BLOCKED"; blockers.push("MANDATORY_EVIDENCE_MISSING"); }
  if (!cleanupReconciliation.passed) { if (result === "PASS") result = "BLOCKED"; blockers.push("CLEANUP_INVENTORY_MISMATCH"); }
  if (findings.length) { result = "FAIL"; blockers.push("CREDENTIAL_SHAPED_EVIDENCE"); }
  const final = {
    schemaVersion: 1, capturedAt, runId: authority.runId, result, blockers,
    finalAlias: aliasParity, migration: snapshot.migration, earnings: snapshot.earnings,
    protectedEvidence, cleanupReconciliation, firebaseAdminLifecycle, credentialFindings: findings, missingEvidence,
    createdResources: cleanupReconciliation.inventory?.resources || [],
  };
  persist(path.join(runDirectory, "final-reconciliation.json"), final);
  atomicWrite(finalizationAttempt, { schemaVersion: 1, runId: authority.runId, startedAt: JSON.parse(fs.readFileSync(finalizationAttempt, "utf8")).startedAt, completedAt: capturedAt, state: "COMPLETE", expectedAliasSha256: expectedRecord.sha256, cleanupSha256: cleanupRecord.sha256, result });
  const manifest = buildEvidenceManifest(runDirectory);
  persist(path.join(runDirectory, "evidence-manifest.tsv"), manifest.bytes);
  const verified = buildEvidenceManifest(runDirectory);
  if (verified.sha256 !== manifest.sha256 || verified.files !== manifest.files) throw new Error("Final evidence manifest verification failed.");
  return { ...final, evidenceManifestSha256: manifest.sha256, evidenceFiles: manifest.files };
}

function recorded(payload, runId, stage, source, requestId, startedAt, completedAt, status = 200) {
  return { runId, stage, source, requestId, startedAt, completedAt, status, payloadSha256: sha256(Buffer.from(canonical(payload))), payload };
}

export function readProgressSnapshot(progressPath, { runId, stage, capturedAt, maximumAgeMs }) {
  const bytes = fs.readFileSync(progressPath);
  const value = JSON.parse(bytes);
  exactKeys(value, ["schemaVersion", "runId", "stage", "capturedAt", "readsSha256", "reads", "errors"], "Hosted read progress");
  if (value.schemaVersion !== 2 || value.runId !== runId || value.stage !== stage || value.readsSha256 !== sha256(Buffer.from(canonical(value.reads)))) throw new Error("Hosted read progress binding or digest mismatch.");
  if (value.capturedAt !== capturedAt || !Array.isArray(value.errors) || value.errors.length) throw new Error("Hosted read progress is incomplete or unsuccessful.");
  validateSnapshotReads(value.reads, stage, { runId, stage, capturedAt, maximumAgeMs });
  return value.reads;
}

export function createFirebaseAppLease({ app, appName, owned, deleteApp = value => value.delete(), listApps = () => [], persist = () => undefined, now = () => Date.now() }) {
  let terminal = null;
  const write = value => { persist({ schemaVersion: 1, appName, owned, ...value }); return value; };
  write({ state: "ACTIVE", capturedAt: iso(now()), passed: null, deletionError: null, registeredAfterClose: null });
  return {
    async close() {
      if (terminal) return terminal;
      if (!owned) {
        terminal = write({ state: "BORROWED", capturedAt: iso(now()), passed: true, deletionError: null, registeredAfterClose: null });
        return terminal;
      }
      let deletionError = null;
      try { await deleteApp(app); } catch (error) { deletionError = sanitizeSupportError(error); }
      let registeredAfterClose = null, verificationError = null;
      try { registeredAfterClose = listApps().some(value => { try { return value.name === appName; } catch { return false; } }); }
      catch (error) { verificationError = sanitizeSupportError(error); }
      const passed = registeredAfterClose === false && !verificationError;
      terminal = write({ state: passed ? "CLOSED" : "CLEANUP_FAILED", capturedAt: iso(now()), passed, deletionError, registeredAfterClose, verificationError });
      if (!passed) throw new Error("Firebase Admin temporary app cleanup could not be independently verified.");
      return terminal;
    },
  };
}

export function createHostedReaders({ root, runId, runDirectory, evidencePrefix, fetchImpl = fetch, now = () => Date.now(), testConfiguration = null, parityClock, deadlineSignal, persistEvidence = atomicWrite }) {
  const registry = testConfiguration?.registry || JSON.parse(fs.readFileSync(path.join(root, "secure/supabase-projects.local.json"), "utf8"));
  const project = registry.projects?.staging;
  if (project?.ref !== DIAGNOSTIC_OPERATOR.supabaseProjectRef || project.ref === registry.projects?.development?.ref) throw new Error("Exact isolated Staging Supabase registry entry required.");
  const managementToken = testConfiguration?.managementToken || fs.readFileSync(path.join(root, "secure/supabase-cli-hungrie/access-token"), "utf8").trim();
  const operator = testConfiguration?.operator || JSON.parse(fs.readFileSync(path.join(root, "secure/phase7/operator-config.json"), "utf8"));
  const credentialPath = path.resolve(operator.firebaseAdminCredentialPath || "");
  const firebaseCredential = testConfiguration?.firebaseCredential || JSON.parse(fs.readFileSync(credentialPath, "utf8"));
  if (firebaseCredential.project_id !== DIAGNOSTIC_OPERATOR.firebaseProjectId || operator.firebaseProjectId !== DIAGNOSTIC_OPERATOR.firebaseProjectId) throw new Error("Exact non-production Firebase credential required.");
  const expoState = testConfiguration ? { auth: { sessionSecret: testConfiguration.expoSession } } : JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".expo/state.json"), "utf8"));
  const expoSession = expoState.auth?.sessionSecret;
  if (!expoSession) throw new Error("Expo session is unavailable.");
  let sequence = 0;
  const capturedReads = {};
  const progressPath = path.join(runDirectory, required(evidencePrefix, "Hosted read evidence prefix") + "-reads-progress.json");
  const persistReadProgress = errors => {
    const capturedAt = iso(now());
    persistEvidence(progressPath, { schemaVersion: 2, runId, stage: evidencePrefix, capturedAt, readsSha256: sha256(Buffer.from(canonical(capturedReads))), reads: capturedReads, errors });
    return capturedAt;
  };
  const capture = async (key, source, operation) => {
    const requestId = runId + ":" + source + ":" + (++sequence);
    const started = now();
    try {
      const response = await operation();
      const completed = now();
      const row = recorded(response.payload, runId, evidencePrefix, source, requestId, iso(started), iso(completed), response.status);
      capturedReads[key] = row;
      persistReadProgress([]);
      return row;
    } catch (error) {
      capturedReads[key] = { runId, stage: evidencePrefix, source, requestId, startedAt: iso(started), completedAt: iso(now()), status: null, payloadSha256: null, payload: null, error: sanitizeSupportError(error) };
      persistReadProgress([source]);
      throw error;
    }
  };
  const supabaseFetch = async (url, init = {}) => {
    const response = await fetchImpl(url, { ...init, headers: { ...(init.headers || {}), authorization: "Bearer " + managementToken } });
    const payload = await response.json();
    return { status: response.status, payload };
  };
  const query = statement => supabaseFetch("https://api.supabase.com/v1/projects/" + project.ref + "/database/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: statement }) });
  const verifiedQueryRows = (result, label) => {
    if (![200, 201].includes(result.status) || !Array.isArray(result.payload)) throw new Error(label + " returned an invalid Supabase SQL response.");
    return result.payload;
  };
  const migrationNames = testConfiguration?.migrationNames || fs.readdirSync(path.join(root, "supabase/migrations")).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
  const catalogSql = "begin transaction read only; select case when strpos(p.oid::regprocedure::text,'.')>0 then p.oid::regprocedure::text else n.nspname||'.'||p.oid::regprocedure::text end identity, encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex') definition_sha256, pg_get_userbyid(p.proowner) owner, p.prosecdef security_definer, p.provolatile volatility, coalesce(array_to_string(p.proconfig,','),'') config, coalesce(p.proacl::text,'') acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('restaurant_transition_order_v1','restaurant_acknowledge_order_seen_v1')) or (n.nspname='private' and p.proname='raise_restaurant_order_conflict_v1') order by identity; rollback;";
  const aliasRead = async ({ signal } = {}) => {
    const document = "query Alias($appId:String!){app{byId(appId:$appId){id workerDeploymentAliases(first:50){edges{node{id aliasName url updatedAt workerDeployment{id deploymentIdentifier url createdAt}}}}}}}";
    const response = await fetchImpl("https://api.expo.dev/graphql", { method: "POST", headers: { "content-type": "application/json", "expo-session": expoSession }, body: JSON.stringify({ query: document, variables: { appId: DIAGNOSTIC_OPERATOR.easProjectId } }), signal });
    const body = await response.json();
    const app = body.data?.app?.byId;
    const alias = app?.workerDeploymentAliases?.edges?.map(edge => edge.node).find(node => node.id === DIAGNOSTIC_OPERATOR.aliasId && node.aliasName === DIAGNOSTIC_OPERATOR.aliasName);
    return { status: response.status, payload: { easProjectId: app?.id, aliasId: alias?.id, aliasName: alias?.aliasName, aliasUrl: alias?.url, deploymentIdentifier: alias?.workerDeployment?.deploymentIdentifier, deploymentUrl: alias?.workerDeployment?.url, updatedAt: alias?.updatedAt || null } };
  };
  let firebaseApp = testConfiguration?.firebaseApp;
  let firebaseCredentialProvider = testConfiguration?.firebaseCredentialProvider;
  let firebaseLease;
  const firebaseLifecyclePath = path.join(runDirectory, evidencePrefix + "-firebase-admin-lifecycle.json");
  let firebaseLifecycleEvents = [];
  if (fs.existsSync(firebaseLifecyclePath)) {
    const prior = JSON.parse(fs.readFileSync(firebaseLifecyclePath, "utf8"));
    if (prior?.schemaVersion !== 1 || prior.runId !== runId || prior.stage !== evidencePrefix || !Array.isArray(prior.events)) throw new Error("Existing Firebase Admin lifecycle evidence is invalid or differently bound.");
    firebaseLifecycleEvents = prior.events;
  }
  const persistFirebaseLifecycle = value => {
    firebaseLifecycleEvents.push(value);
    persistEvidence(firebaseLifecyclePath, { schemaVersion: 1, runId, stage: evidencePrefix, events: firebaseLifecycleEvents });
  };
  if (!firebaseApp) {
    const functionsRequire = createRequire(path.join(root, "functions/package.json"));
    const adminApp = functionsRequire("firebase-admin/app");
    firebaseCredentialProvider = adminApp.cert(firebaseCredential);
    const appName = "alias-support-" + runId + "-" + Date.now();
    firebaseApp = adminApp.initializeApp({ credential: firebaseCredentialProvider, projectId: DIAGNOSTIC_OPERATOR.firebaseProjectId }, appName);
    firebaseLease = createFirebaseAppLease({ app: firebaseApp, appName, owned: true, deleteApp: adminApp.deleteApp, listApps: adminApp.getApps, now, persist: persistFirebaseLifecycle });
  } else {
    firebaseCredentialProvider ||= firebaseApp.options?.credential;
    firebaseLease = createFirebaseAppLease({ app: firebaseApp, appName: testConfiguration?.firebaseAppName || "injected-test-app", owned: false, now, persist: persistFirebaseLifecycle });
  }
  if (!firebaseCredentialProvider?.getAccessToken) throw new Error("Firebase Admin credential provider is unavailable.");
  return {
    async collect() {
      const supabaseProject = await capture("supabaseProject", "supabase-project", () => supabaseFetch("https://api.supabase.com/v1/projects/" + project.ref));
      const token = await firebaseCredentialProvider.getAccessToken();
      const firebaseProject = await capture("firebaseProject", "firebase-project", async () => {
        const response = await fetchImpl("https://firebase.googleapis.com/v1beta1/projects/" + DIAGNOSTIC_OPERATOR.firebaseProjectId, { headers: { authorization: "Bearer " + token.access_token } });
        const payload = await response.json();
        return { status: response.status, payload: { projectId: payload.projectId } };
      });
      const alias = await capture("alias", "expo-alias", aliasRead);
      const migrationHistory = await capture("migrationHistory", "supabase-migrations", async () => {
        const result = await query("begin transaction read only; select version from supabase_migrations.schema_migrations order by version; rollback;");
        const applied = verifiedQueryRows(result, "Migration history query").map(row => String(row.version));
        return { status: result.status, payload: { applied, pending: migrationNames.map(name => name.slice(0, 14)).filter(version => !applied.includes(version)), localMigrationSha256: testConfiguration?.localMigrationSha256 || sha256(fs.readFileSync(path.join(root, "supabase/migrations/20260924140000_restaurant_order_conflict_transport.sql"))) } };
      });
      const functionCatalog = await capture("functionCatalog", "supabase-function-catalog", async () => {
        const result = await query(catalogSql);
        return { status: result.status, payload: { rows: verifiedQueryRows(result, "Function catalog query") } };
      });
      const earnings = await capture("earnings", "supabase-earnings-capability", async () => {
        const result = await query("begin transaction read only; select capability,enabled from private.restaurant_earnings_capabilities where capability='restaurant_earnings_v1'; rollback;");
        return { status: result.status, payload: verifiedQueryRows(result, "Earnings capability query")[0] || null };
      });
      const completedAt = persistReadProgress([]);
      return readProgressSnapshot(progressPath, { runId, stage: evidencePrefix, capturedAt: completedAt, maximumAgeMs: evidencePrefix === "baseline-preflight" ? SUPPORT.freshnessMs.baseline : SUPPORT.freshnessMs.final });
    },
    async verifyAliasParity(expected) {
      const evidence = await verifyRollbackParity({
        aliasUrl: DIAGNOSTIC_OPERATOR.aliasUrl,
        runId,
        expected,
        retrieveMetadata: async ({ attempt, record: persistObservation, signal }) => {
          if (typeof persistObservation !== "function") throw new Error("Verifier metadata persistence interface is unavailable.");
          const started = now();
          const requestId = runId + ":expo-alias-final-parity:" + attempt + ":" + (++sequence);
          try {
            const result = await aliasRead({ signal });
            const completed = now();
            const row = recorded(result.payload, runId, "final-alias-parity", "expo-alias-final-parity", requestId, iso(started), iso(completed), result.status);
            await persistObservation({ type: "metadata", ...row });
            return result.payload;
          } catch (error) {
            await persistObservation({ type: "metadata", runId, stage: "final-alias-parity", source: "expo-alias-final-parity", requestId, startedAt: iso(started), completedAt: iso(now()), status: null, payloadSha256: null, payload: null, error: sanitizeSupportError(error) });
            throw error;
          }
        },
        persist: value => persistEvidence(path.join(runDirectory, "final-alias-verification-progress.json"), value),
        fetchImpl,
        ...(parityClock ? { clock: parityClock } : {}),
        ...(deadlineSignal ? { deadlineSignal } : {}),
      });
      persistEvidence(path.join(runDirectory, "final-alias-verification.json"), evidence);
      return { ...evidence, deploymentIdentifier: expected.deploymentIdentifier };
    },
    async close() { return firebaseLease.close(); },
  };
}

export async function runSupport(argv = process.argv.slice(2), dependencies = {}) {
  const { action, values } = parseOptions(argv);
  const root = path.resolve(import.meta.dirname, "..");
  if (action === "prepare-authority") {
    (dependencies.prerequisiteVerifier || verifyLocalDiagnosticPrerequisites)({ root });
    const approval = JSON.parse(fs.readFileSync(path.resolve(required(values.approval, "Approval path")), "utf8"));
    const exportEvidencePath = path.resolve(required(values["export-readiness-evidence"], "Read-only EAS export evidence path"));
    if (!fs.existsSync(exportEvidencePath)) throw new Error("Passing read-only EAS export evidence is required before diagnostic authority preparation.");
    (dependencies.exportEvidenceVerifier || verifyReadOnlyEasExportEvidence)(JSON.parse(fs.readFileSync(exportEvidencePath, "utf8")), { sourceCommit: approval.sourceCommit, sourceManifestSha256: approval.sourceManifestSha256 });
    const output = path.resolve(required(values.output, "Authority output directory"));
    return prepareAuthorityArtifacts({ repoRoot: root, approval, outputDirectory: output, spawn: dependencies.spawnSync || spawnSync });
  }
  const actions = new Set(["baseline-preflight", "initialize-resources", "begin-deployment", "register-deployment", "record-deployment-uncertainty", "produce-deployment-reconciliation", "reconcile-deployment", "prepare-recapture", "verify-recapture", "final-preflight", "prepare-expected-alias", "prepare-cleanup", "record-abort", "finalize"]);
  if (!actions.has(action)) throw new Error("Unsupported execution-support action.");
  const authorityPath = path.resolve(required(values.authority, "Authority path"));
  const expectedCommit = required(values["expect-commit"], "Expected support checkpoint");
  const expectedSourceSha256 = required(values["expect-source-sha256"], "Expected source manifest SHA-256");
  const authority = validateAuthority(JSON.parse(fs.readFileSync(authorityPath, "utf8")), { runId: SUPPORT.runId, sourceCommit: expectedCommit, sourceManifestSha256: expectedSourceSha256 });
  requireMaintenanceWindow(authority, action === "finalize" ? "verify-rollback" : action, Number(values["current-time-ms"] || Date.now()));
  if (spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim() !== expectedCommit || spawnSync("git", ["rev-parse", "HEAD:apps/restaurant"], { cwd: root, encoding: "utf8" }).stdout.trim() !== SUPPORT.applicationTree) throw new Error("Approved support checkpoint is not checked out.");
  const sourceManifestPath = path.resolve(required(values["source-manifest"], "Source manifest path"));
  if (!fs.existsSync(sourceManifestPath) || sha256(fs.readFileSync(sourceManifestPath)) !== expectedSourceSha256) throw new Error("Approved support source manifest file required.");
  const runDirectory = path.join(root, SUPPORT.evidenceDirectory);
  fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
  const confirmation = "staging:restaurant-alias-support:" + action + ":" + SUPPORT.runId;
  if (values.confirm !== confirmation) throw new Error("Action-specific execution-support confirmation mismatch.");
  if (action === "record-abort") return recordTerminalState({ runDirectory, authority, classification: values.classification || "ABORTED", reason: required(values.reason, "Abort reason"), capturedAt: new Date().toISOString() });
  if (action === "initialize-resources") return initializeResourceInventory({ runDirectory, authority, capturedAt: new Date().toISOString() });
  if (action === "begin-deployment") return beginSingleDeploymentAttempt({ runDirectory, authority, capturedAt: new Date().toISOString() });
  if (action === "register-deployment") return registerSingleDeployment({ runDirectory, authority, capturedAt: new Date().toISOString() });
  if (action === "record-deployment-uncertainty") return recordDeploymentUncertainty({ runDirectory, authority, capturedAt: new Date().toISOString(), reason: required(values.reason, "Deployment uncertainty reason") });
  if (action === "produce-deployment-reconciliation") {
    const expoState = dependencies.expoSession ? { auth: { sessionSecret: dependencies.expoSession } } : JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".expo/state.json"), "utf8"));
    return produceDeploymentReconciliationEvidence({ runDirectory, authority, capturedAt: new Date().toISOString(), fetchImpl: dependencies.fetchImpl || fetch, expoSession: expoState.auth?.sessionSecret });
  }
  if (action === "reconcile-deployment") return reconcileDeploymentObservation({ runDirectory, authority, observationPath: path.resolve(required(values.observation, "Provider deployment observation")), capturedAt: new Date().toISOString() });
  if (action === "prepare-recapture") return prepareFreshRollbackRecapture({ runDirectory, authority, capturedAt: new Date().toISOString() });
  if (action === "verify-recapture") return verifyFreshRollbackRecapture({ runDirectory, authority, capturedAt: new Date().toISOString() });
  if (action === "prepare-expected-alias") return buildExpectedFinalAliasReference({ runDirectory, authority, capturedAt: new Date().toISOString() });
  if (action === "prepare-cleanup") return buildCleanupDisposition({ runDirectory, authority, capturedAt: new Date().toISOString() });
  const evidencePrefix = action === "baseline-preflight" ? "baseline-preflight" : action === "final-preflight" ? "promotion-preflight" : "finalization";
  const readers = dependencies.readers || createHostedReaders({ root, runId: SUPPORT.runId, runDirectory, evidencePrefix });
  let primaryError = null;
  try {
    if (action === "baseline-preflight") {
      const reads = await readers.collect();
      atomicWrite(path.join(runDirectory, "baseline-preflight-reads.json"), { schemaVersion: 1, runId: SUPPORT.runId, reads });
      const result = buildBaselinePreflight({ authority, reads, protectedEvidence: verifyProtectedEvidence(root), capturedAt: new Date().toISOString() });
      atomicWrite(path.join(runDirectory, "baseline-preflight.json"), result);
      return result;
    }
    if (action === "final-preflight") {
      const reads = await readers.collect();
      atomicWrite(path.join(runDirectory, "promotion-preflight-reads.json"), { schemaVersion: 1, runId: SUPPORT.runId, reads });
      const result = buildFinalPreflight({ authority, reads, protectedEvidence: verifyProtectedEvidence(root), runDirectory, capturedAt: new Date().toISOString() });
      atomicWrite(path.join(runDirectory, "promotion-preflight.json"), result);
      return result;
    }
    const expectedPath = path.resolve(required(values.expected, "Expected final alias reference"));
    const cleanupPath = path.resolve(required(values.cleanup, "Cleanup disposition"));
    const expectedAlias = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
    const cleanup = JSON.parse(fs.readFileSync(cleanupPath, "utf8"));
    if (!readers.verifyAliasParity) throw new Error("Independent final alias parity reader required.");
    return finalizeRun({ root, runDirectory, authority, expectedAlias, readers, cleanup, capturedAt: new Date().toISOString() });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (readers.close) {
      try { await readers.close(); }
      catch (cleanupError) {
        if (primaryError) throw new AggregateError([primaryError, cleanupError], "Hosted reconciliation failed and Firebase Admin cleanup also failed.");
        throw cleanupError;
      }
    }
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) runSupport().then(result => process.stdout.write(canonical(result))).catch(error => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
