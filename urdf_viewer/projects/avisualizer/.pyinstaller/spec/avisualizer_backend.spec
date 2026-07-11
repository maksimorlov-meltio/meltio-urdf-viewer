# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['D:\\Software\\process-intelligence-repo-main\\urdf_viewer\\scripts\\run_avisualizer_backend.py'],
    pathex=['D:\\Software\\process-intelligence-repo-main\\urdf_viewer\\projects\\avisualizer\\src'],
    binaries=[],
    datas=[('D:\\Software\\process-intelligence-repo-main\\urdf_viewer\\projects\\avisualizer\\src\\avisualizer\\web\\static', 'avisualizer/web/static'), ('D:\\Software\\process-intelligence-repo-main\\urdf_viewer\\projects\\avisualizer\\assets', 'assets'), ('D:\\Software\\process-intelligence-repo-main\\urdf_viewer\\projects\\avisualizer\\database', 'database')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='avisualizer_backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
