function visitObject(root, visit) {
    if (typeof root?.traverse === 'function') {
        root.traverse(visit);
        return;
    }

    const stack = root ? [root] : [];
    while (stack.length) {
        const current = stack.pop();
        visit(current);
        if (Array.isArray(current.children)) {
            for (let i = current.children.length - 1; i >= 0; i -= 1) {
                stack.push(current.children[i]);
            }
        }
    }
}

function toMaterialList(material) {
    return Array.isArray(material) ? material : [material];
}

export function replaceRockMaterialsByTraversal(root, createMaterial) {
    let visitedMeshes = 0;
    let replacedMaterials = 0;
    const previousMaterialNames = new Set();

    visitObject(root, (object) => {
        if (!object?.isMesh || !object.material) return;
        visitedMeshes += 1;
        if (Array.isArray(object.material)) {
            object.material = object.material.map((material, materialIndex) => {
                previousMaterialNames.add(material?.name || '(runtime-default)');
                replacedMaterials += 1;
                return createMaterial({ mesh: object, previous: material, materialIndex });
            });
            return;
        }

        const previous = object.material;
        previousMaterialNames.add(previous?.name || '(runtime-default)');
        object.material = createMaterial({ mesh: object, previous, materialIndex: 0 });
        replacedMaterials += 1;
    });

    return {
        strategy: 'asset-class-traversal',
        visitedMeshes,
        replacedMaterials,
        previousMaterialNames: [...previousMaterialNames].sort(),
    };
}

export function replaceTreeMaterialsByName(root, factories) {
    const targetNames = Object.keys(factories).sort();
    const seenNames = new Set();
    let visitedMeshes = 0;
    let replacedMaterials = 0;

    visitObject(root, (object) => {
        if (!object?.isMesh || !object.material) return;
        visitedMeshes += 1;
        const materials = toMaterialList(object.material);
        const replacement = materials.map((material, materialIndex) => {
            const name = material?.name || '';
            if (name) seenNames.add(name);
            const factory = factories[name];
            if (!factory) return material;
            replacedMaterials += 1;
            return factory({ mesh: object, previous: material, materialIndex });
        });
        object.material = Array.isArray(object.material) ? replacement : replacement[0];
    });

    return {
        strategy: 'material-name',
        targetNames,
        seenNames: [...seenNames].sort(),
        missingTargets: targetNames.filter((name) => !seenNames.has(name)),
        visitedMeshes,
        replacedMaterials,
    };
}
