# Architecture

## Repository model

Monorepo structure with project folders under `projects/` and shared docs/scripts at root.

## First project: avisualizer

`avisualizer` is now organized as a web-first sensor visualization project with an extensible backend pipeline.

Primary module boundaries:

- `web/app.py` API and static web hosting
- `web/services/sensor_pointcloud.py` CSV ingestion + Open3D point cloud processing
- `web/static/app.js` Three.js rendering and interaction loop
- `web/static/index.html` and `web/static/styles.css` web shell
- `database/<dataset>/Sensors.csv` and `HeadCams.mp4` source data

## Future expansion

Additional projects can be added under `projects/`. AI services and database connectors can either be:

- New projects under `projects/`
- Shared libraries under a future `libs/` folder if cross-project reuse emerges

Planned `avisualizer` expansion points:

- Attribute-color switching and composable filters
- Brush/box selection and labeling persistence
- Voxel alignment service fed by selected points
- Split-screen synchronized comparison views
