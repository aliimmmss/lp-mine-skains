from pathlib import Path
import sys


if len(sys.argv) != 2:
    raise SystemExit('usage: patch-m4-safe-authority-v2.py <audit-script>')

path = Path(sys.argv[1])
content = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global content
    count = content.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    content = content.replace(old, new, 1)


replace_once(
    "const EXPECTED_SINGLETON = getAddress('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762')\n",
    """const EXPECTED_SINGLETON = getAddress('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762')
const EXPECTED_SINGLETON_LENGTH = 24_421
const EXPECTED_SINGLETON_HASH = '0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff'
const EXPECTED_SAFE_VERSION = '1.4.1'
const PINNED_GUARD_SLOT = '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8'
const PINNED_FALLBACK_HANDLER_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5'
""",
    'official Safe v1.4.1 pins',
)

replace_once(
    """          sourceSlots: {
            guard: extractStorageSlot(text, 'GUARD_STORAGE_SLOT'),
            fallbackHandler: extractStorageSlot(text, 'FALLBACK_HANDLER_STORAGE_SLOT'),
          },
""",
    """          sourceSlots: {
            guard: PINNED_GUARD_SLOT,
            fallbackHandler: PINNED_FALLBACK_HANDLER_SLOT,
          },
""",
    'pinned authority slots',
)

replace_once(
    """const implementationAgreement =
  implementationEvidence.agreement &&
  implementationEvidence.providers.every((provider) => provider.code.hasCode) &&
  implementationMetadata.contract?.name === 'SafeL2'
""",
    """const implementationAgreement =
  implementationEvidence.agreement &&
  implementationEvidence.providers.every(
    (provider) =>
      provider.code.hasCode &&
      provider.code.byteLength === EXPECTED_SINGLETON_LENGTH &&
      provider.code.bytecodeHash === EXPECTED_SINGLETON_HASH,
  ) &&
  implementationMetadata.contract?.name === 'SafeL2' &&
  implementationMetadata.contract?.isVerified === true
""",
    'singleton identity gate',
)

replace_once(
    """  if (state.code.byteLength !== EXPECTED_PROXY_LENGTH || state.code.bytecodeHash !== EXPECTED_PROXY_HASH) {
    reasons.push('unexpected-proxy-runtime')
  }
  return { valid: reasons.length === 0, reasons }
""",
    """  if (state.code.byteLength !== EXPECTED_PROXY_LENGTH || state.code.bytecodeHash !== EXPECTED_PROXY_HASH) {
    reasons.push('unexpected-proxy-runtime')
  }
  if (state.version !== EXPECTED_SAFE_VERSION) reasons.push('unexpected-safe-version')
  return { valid: reasons.length === 0, reasons }
""",
    'version validation',
)

replace_once(
    """    else if (first.slots.implementation || first.slots.beacon) classification = 'eip1967-proxy'
    else classification = 'contract-unclassified'
""",
    """    else if (first.slots.implementation || first.slots.beacon) classification = 'eip1967-proxy'
    else if (explorer.contract?.isVerified === true) classification = 'verified-contract'
    else classification = 'contract-unclassified'
""",
    'verified contract classification',
)

replace_once(
    """  expectedSingleton: EXPECTED_SINGLETON,
  implementationMetadata,
""",
    """  pinnedOfficialSafe: {
    version: EXPECTED_SAFE_VERSION,
    singleton: EXPECTED_SINGLETON,
    singletonLength: EXPECTED_SINGLETON_LENGTH,
    singletonHash: EXPECTED_SINGLETON_HASH,
    guardSlot: PINNED_GUARD_SLOT,
    fallbackHandlerSlot: PINNED_FALLBACK_HANDLER_SLOT,
  },
  expectedSingleton: EXPECTED_SINGLETON,
  implementationMetadata,
""",
    'result provenance',
)

path.write_text(content)
