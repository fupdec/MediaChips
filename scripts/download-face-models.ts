/**
 * Face ONNX weights are no longer bundled in distribution packages.
 * SCRFD det_10g (~16 MB), InsightFace R50 (~170 MB), and genderage (~1.3 MB)
 * download on demand from Face settings / first detect-enroll-match run.
 */
async function main() {
  console.log('Face models (SCRFD + R50 + genderage) are downloaded on demand; nothing to pre-bundle.')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
