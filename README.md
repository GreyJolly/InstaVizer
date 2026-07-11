# InstaVizer

Instavizer browser-based visual analytics tool for comparing different instantiations of an Entity-Relationship schema.

One schema file and any number of instance files are loaded, then the charting and filtering tools provided to spot clusters, outliers, and structural or attribute-level differences across instantiations.

All visualisations are schema-agnostic: they read from the loaded schema and instance data without assumptions about domain, entity names, or attribute semantics.

- The visualisations allow for exploring various aspects of the instantiations
- Filtering tools allow to focus exploration to subsets of the instantiations
- File colouring and grouping allow to visually keep track of instantiations across visualisation when looking for insights

## Using the tool

The application runs entirerly in-browser. It is hosted online using GitHub Pages and can be accessed at: [https://greyjolly.github.io/InstaVizer/](https://greyjolly.github.io/InstaVizer/).

It can be self-hosted using the code provided in the repository.

>[!IMPORTANT]
>This project uses Web Workers which cannot run from the `file://` protocol due to browser security restrictions. Tu run, host the files on a local server.

## User Manual

The [user manual](/docs/user-manual.md) is available inside of the `docs/` directory.

## License

GPL-3.0. See [LICENSE](LICENSE).
