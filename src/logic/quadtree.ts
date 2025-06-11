// src/logic/quadtree.ts

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface QuadtreeNode {
    bounds: BoundingBox;
    particles: { x: number; y: number; index: number; type?: number; }[];
    children: QuadtreeNode[] | null;
    isLeaf: boolean;
    depth: number; // Correctly added
}

export class Quadtree {
    private root: QuadtreeNode;
    private maxParticlesPerNode: number;
    private maxDepth: number;

    constructor(bounds: BoundingBox, maxParticlesPerNode: number = 4, maxDepth: number = 8) {
        this.root = { bounds, particles: [], children: null, isLeaf: true, depth: 0 }; // Initialize root with depth 0
        this.maxParticlesPerNode = maxParticlesPerNode;
        this.maxDepth = maxDepth;
    }

    insert(
        particle: { x: number; y: number; index: number; type?: number },
        node: QuadtreeNode = this.root,
        currentDepth: number = 0 // Parameter name for clarity
    ): boolean {
        if (!this.contains(node.bounds, particle.x, particle.y)) {
            return false; // Particle is outside this node's bounds
        }

        if (node.isLeaf) {
            // If there's space, or max depth is reached (must stop subdividing here)
            if (node.particles.length < this.maxParticlesPerNode || currentDepth >= this.maxDepth) {
                node.particles.push(particle);
                return true; // Successfully inserted
            }
            // Else, it's a full leaf node and can subdivide (currentDepth < maxDepth)
            this.subdivide(node); // Subdivide this node
        }

        // Now the node is either just subdivided or was already an internal node.
        // Attempt to insert the *current particle* into one of the children.
        for (const child of node.children!) {
            if (this.insert(particle, child, currentDepth + 1)) { // Recursive call with incremented depth
                return true; // Successfully inserted into a child
            }
        }

        // If the particle couldn't be inserted into any child (e.g., it spans boundaries,
        // or it's too large for a child, or children are full and maxDepth is reached),
        // it must reside in this current node (which is now an internal node).
        node.particles.push(particle); // Store in the current (internal) node
        return true; // Successfully inserted into the current internal node
    }

    query(range: BoundingBox, node: QuadtreeNode = this.root, found: { x: number; y: number; index: number; type?: number; }[] = []): { x: number; y: number; index: number; type?: number; }[] {
        if (!this.intersects(node.bounds, range)) {
            return found;
        }

        for (const p of node.particles) {
            // Check if particle is actually within the query range (circular or precise distance check)
            if (this.contains(range, p.x, p.y)) { // The contains here is for the bounding box
                found.push(p);
            }
        }

        if (!node.isLeaf) {
            for (const child of node.children!) {
                this.query(range, child, found);
            }
        }
        return found;
    }

    private subdivide(node: QuadtreeNode) {
        node.isLeaf = false;
        node.children = [];

        const hw = node.bounds.width / 2;
        const hh = node.bounds.height / 2;
        const x = node.bounds.x;
        const y = node.bounds.y;

        node.children.push({ bounds: { x: x, y: y, width: hw, height: hh }, particles: [], children: null, isLeaf: true, depth: node.depth + 1 });             // NW
        node.children.push({ bounds: { x: x + hw, y: y, width: hw, height: hh }, particles: [], children: null, isLeaf: true, depth: node.depth + 1 });         // NE
        node.children.push({ bounds: { x: x, y: y + hh, width: hw, height: hh }, particles: [], children: null, isLeaf: true, depth: node.depth + 1 });         // SW
        node.children.push({ bounds: { x: x + hw, y: y + hh, width: hw, height: hh }, particles: [], children: null, isLeaf: true, depth: node.depth + 1 });     // SE

        const oldParticles = node.particles; // Get particles that were in this node before subdivision
        node.particles = []; // Clear parent node's particles array to re-distribute them

        // Re-insert *only the old particles* from this node into the new children
        for (const p of oldParticles) {
            let placedInChild = false;
            for (const child of node.children!) {
                if (this.insert(p, child, node.depth + 1)) { // Attempt to insert old particle into children
                    placedInChild = true;
                    break;
                }
            }
            if (!placedInChild) {
                // If an old particle couldn't be placed in a child (e.g., spans boundaries),
                // it remains in this parent node (which is now an internal node).
                node.particles.push(p);
            }
        }
    }

    private contains(box: BoundingBox, px: number, py: number): boolean {
        // Updated contains to be inclusive of min edge, exclusive of max edge (common for grids)
        return px >= box.x && px < (box.x + box.width) &&
               py >= box.y && py < (box.y + box.height);
    }

    private intersects(box1: BoundingBox, box2: BoundingBox): boolean {
        return box1.x < (box2.x + box2.width) && (box1.x + box1.width) > box2.x &&
               box1.y < (box2.y + box2.height) && (box1.y + box1.height) > box2.y;
    }
}