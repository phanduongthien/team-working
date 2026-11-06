import type { SttModel, VoiceComponent } from '@shared/voice'

export type ModelFile = { name: string; sha256?: string; size?: number }
export type ModelSpec = { repo: string; revision: string; dir: string; files: ModelFile[] }

/**
 * Model tải từ Hugging Face, khoá theo commit (URL bất biến). File lớn kiểm tra SHA-256 (oid LFS),
 * file nhỏ (config, tokenizer) tin theo commit đã khoá. Lấy ngày 2026-11-06.
 */
const whisper = (
  repo: string,
  revision: string,
  size: number,
  sha256: string,
  extra: string[]
): ModelSpec => ({
  repo,
  revision,
  dir: repo.split('/')[1],
  files: [
    { name: 'model.bin', size, sha256 },
    { name: 'config.json' },
    { name: 'tokenizer.json' },
    ...extra.map((name) => ({ name }))
  ]
})

export const MODELS: Record<SttModel | 'piper', ModelSpec> = {
  base: whisper(
    'Systran/faster-whisper-base',
    'ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66',
    145_217_532,
    'd01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9',
    ['vocabulary.txt']
  ),
  small: whisper(
    'Systran/faster-whisper-small',
    '536b0662742c02347bc0e980a01041f333bce120',
    483_546_902,
    '3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671',
    ['vocabulary.txt']
  ),
  medium: whisper(
    'Systran/faster-whisper-medium',
    '08e178d48790749d25932bbc082711ddcfdfbc4f',
    1_527_906_378,
    '9b45e1009dcc4ab601eff815b61d80e60ce3fd8c74c1a14f4a282258286b51ae',
    ['vocabulary.txt']
  ),
  'large-v3-turbo': whisper(
    'dropbox-dash/faster-whisper-large-v3-turbo',
    '0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf',
    1_617_884_929,
    'e76620f83d5f5b69efd3d87e3dc180c1bd21df9fbebacfd4335e5e1efcc018da',
    ['vocabulary.json', 'preprocessor_config.json']
  ),
  piper: {
    repo: 'rhasspy/piper-voices',
    revision: 'e7229f7d33a10e145e109b886d661984201ac3c4',
    dir: 'piper-vi_VN-vais1000-medium',
    files: [
      {
        name: 'vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx',
        size: 63_201_294,
        sha256: 'ec7c89e2c85f4d1edc24b6120c18aaf1bda614f06b511567eb9c7c0de15e2dab'
      },
      { name: 'vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx.json' }
    ]
  }
}

/** Dung lượng tải (MB, làm tròn lên) — đo từ PyPI / Hugging Face. */
export const SIZES_MB: Record<VoiceComponent, number> = {
  packages: 120, // edge-tts, piper-tts (onnxruntime), faster-whisper (ctranslate2, av)
  cuda: 1265, // nvidia-cublas-cu12 528 MB + nvidia-cudnn-cu12 661 MB + nvrtc 73 MB
  piper: 64,
  base: 148,
  small: 487,
  medium: 1462,
  'large-v3-turbo': 1547
}

export const fileUrl = (spec: ModelSpec, name: string): string =>
  `https://huggingface.co/${spec.repo}/resolve/${spec.revision}/${name}`
