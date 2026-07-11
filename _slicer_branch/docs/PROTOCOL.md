# Protocol

## Web endpoint contract

Primary sensor endpoint:

- `GET /api/sensors`

Compatibility alias:

- `GET /api/sensors/binary`

Series endpoint used by the 2D trend view:

- `GET /api/attribute-series`

Supported query parameters:

- `dataset` (string): dataset folder under `projects/avisualizer/database/`
- `attribute` (string): CSV attribute used for color mapping (for example `loadCell`)
- `view` (`point` | `voxel`)
- `voxel_size_mm` (float, `0.1..20.0`): voxel size in X/Y
- `voxel_size_z_mm` (float, `0.1..20.0`): voxel size in Z
- `max_points` (int, `1..2_000_000`)

Attribute series query parameters:

- `dataset` (string): dataset folder under `projects/avisualizer/database/`
- `attribute` (string): CSV attribute used for charting (for example `loadCell`)
- `max_samples` (int, `10..10000`)

## Response contract

### `GET /api/sensors` and `GET /api/sensors/binary`

- Response content type: `application/octet-stream`
- Payload layout: packed `float32` rows using `X-AV-PointStride`
- Current stride value: `5`
- Current row layout: `[x_centered, y_centered, z_centered, attribute, source_index]`

Important response headers:

- `X-AV-Dataset`, `X-AV-Attribute`, `X-AV-ViewMode`
- `X-AV-VoxelSizeMm`, `X-AV-VoxelSizeZMm`, `X-AV-BackendEngine`
- `X-AV-TotalPoints`, `X-AV-RenderedPoints`
- `X-AV-Center`
- `X-AV-Bounds-Min`, `X-AV-Bounds-Max`
- `X-AV-Attr-Range`
- `X-AV-PointStride`

### `GET /api/attribute-series`

JSON response fields:

- `dataset`
- `attribute`
- `totalSamples`
- `sampledValues`
- `sampledIndices`
- `range.min`, `range.max`

## Notes

- Coordinates in packed sensor rows are centered using `X-AV-Center` before transport to the frontend.
- In voxel mode, voxel bins are anchored to CSV minima, with the first voxel center at `min + 0.5 * voxel_size` on each axis.
