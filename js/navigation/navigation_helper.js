import {
Float32BufferAttribute,
MeshBasicMaterial,
Mesh,
DoubleSide,
Group,
BoxGeometry,
InstancedMesh,
Object3D,
BufferGeometry,
LineBasicMaterial,
LineSegments,
BufferAttribute,
CanvasTexture,
LinearMipmapLinearFilter,
LinearFilter,
PlaneGeometry,
InstancedBufferGeometry,
InstancedBufferAttribute,
Matrix4,
Vector3,
Quaternion,
} from "three";


const navigation_spatial_shift_x=17179869184; // 2^34
const navigation_spatial_shift_z=131072; // 2^17
const navigation_spatial_offset=65536; // СИММЕТРИЧНЫЙ СДВИГ ВО ВСЕ СТОРОНЫ КУБА


class navigation_helper{


// ____________________ create_navigation_convex_polygon_helper ____________________


static create_navigation_convex_polygon_helper(polygons,offset_y){


let start_time=performance.now();


const positions=[];
const colors=[];


for (let i=0; i < polygons.length; i++) {
const poly=polygons[i];
const verts=poly.vertices;
const numVerts=verts.length;


if (numVerts < 3) continue;


const r=Math.random(), g=Math.random(), b=Math.random();


// Идеальная веерная триангуляция WebGL без atan2
for (let j=1; j < numVerts-1; j++) {
const v0=verts[0];
const v1=verts[j];
const v2=verts[j+1];


positions.push(v0.x, v0.y, v0.z);
positions.push(v1.x, v1.y, v1.z);
positions.push(v2.x, v2.y, v2.z);


colors.push(r, g, b, r, g, b, r, g, b);
}
}


const geometry=new BufferGeometry();
geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
geometry.computeVertexNormals();


let mesh=new Mesh(geometry,new MeshBasicMaterial({
vertexColors:true,
side:DoubleSide,
}));
mesh.position.y=offset_y;


console.log("create_navigation_convex_polygon_helper: "+(performance.now()-start_time).toFixed(2)+"ms");


return mesh;


}


// ____________________ create_navigation_graph_helper ____________________


static create_navigation_graph_helper(polygons,offset_y,scale,lines_color=0xffffff,centroids_color=0x4e84c4){


let start_time=performance.now();


const group=new Group();
const linePositions=[];
const numPolygons=polygons.length;


// Набор для защиты от дублирования линий связей А->В и В->А
const renderedPairs=new Set();


const instanced_mesh=new InstancedMesh(new BoxGeometry(0.03*scale,0.03*scale,0.03*scale), new MeshBasicMaterial({ color:centroids_color }), numPolygons);


let instanced_mesh_instanceMatrix_array=instanced_mesh.instanceMatrix.array;


for (let i=0; i < numPolygons; i++) {


const poly=polygons[i];
const cA=poly.centroid;


let offset=i*16;
instanced_mesh_instanceMatrix_array[offset+12]=cA.x;
instanced_mesh_instanceMatrix_array[offset+13]=cA.y;
instanced_mesh_instanceMatrix_array[offset+14]=cA.z;


// --- 2. СБОРКА ЛИНИЙ СВЯЗЕЙ ---
const neighbours=poly.neighbours || [];
for (let j=0; j < neighbours.length; j++) {
const neighbourId=neighbours[j];
const polyB=polygons[neighbourId];


if (!polyB) continue;


const pairKey=poly.id < polyB.id ? `${poly.id}_${polyB.id}` :`${polyB.id}_${poly.id}`;
if (renderedPairs.has(pairKey)) continue;
renderedPairs.add(pairKey);


const cB=polyB.centroid;


// Добавляем сегмент линии от центра А до центра В
linePositions.push(cA.x, cA.y, cA.z);
linePositions.push(cB.x, cB.y, cB.z);
}
}


// Добавляем массив сфер в финальную группу
group.add(instanced_mesh);


// --- 3. ОТРИСОВКА ЛИНИЙ СВЯЗЕЙ ---
if (linePositions.length > 0) {
const lineGeometry=new BufferGeometry();
lineGeometry.setAttribute("position", new Float32BufferAttribute(linePositions, 3));


const lineMaterial=new LineBasicMaterial({ 
color:lines_color
});


const connections=new LineSegments(lineGeometry, lineMaterial);
group.add(connections);
}


group.position.y=offset_y;


console.log("create_navigation_graph_helper: "+(performance.now()-start_time).toFixed(2)+"ms");


return group;


}


// ____________________ create_navigation_spatial_helper ____________________



static create_navigation_spatial_helper(navigation_spatial,color=0x00ff00){


let start_time=performance.now();


const count=navigation_spatial.cells_array.size;
const minX=navigation_spatial.cells_min_x_num, maxX=navigation_spatial.cells_max_x_num;
const minZ=navigation_spatial.cells_min_z_num, maxZ=navigation_spatial.cells_max_z_num;
const minY=navigation_spatial.cells_min_y_num, maxY=navigation_spatial.cells_max_y_num;


const rawDimX=(maxX-minX)+3, dimX32=((rawDimX+31) >> 5)+1;
const dimZ=(maxZ-minZ)+3, dimY=(maxY-minY)+3, totalVolumeSize32=dimX32*dimZ*dimY;


const bitVolume32 = new Int32Array(totalVolumeSize32*2);
const positionsBuffer = new Float32Array(count*144);


let posIdx=0, strideZ=dimX32, strideY=dimX32*dimZ;
const size_xz=navigation_spatial.cells_size_xz, size_y=navigation_spatial.cells_size_y;


// 1. ФАЗА КЭШИРОВАНИЯ
for (let keys=navigation_spatial.cells_array.keys(), res=keys.next(); !res.done; res=keys.next()) {
const lx=((res.value / navigation_spatial_shift_x) | 0)-navigation_spatial_offset-minX+1;
const lz=(((res.value % navigation_spatial_shift_x) / navigation_spatial_shift_z) | 0)-navigation_spatial_offset-minZ+1;
const ly=(res.value % navigation_spatial_shift_z)-navigation_spatial_offset-minY+1;
bitVolume32[ly*strideY+lz*strideZ+(lx >> 5)] |= (1 << (lx & 31));
}


const sLy=1, eLy=(maxY-minY)+2, sLz=1, eLz=(maxZ-minZ)+2, endXCoord=maxX+1;


// 2. СКАНИРОВАНИЕ ПО ОСИ X
for (let ly0=sLy; ly0 <= eLy; ly0++) {
const offset_y0=ly0*strideY, offset_y1=(ly0-1)*strideY, currentY=(ly0+minY-1)*size_y;
for (let lz0=sLz; lz0 <= eLz; lz0++) {
const idx_y0_z0=offset_y0+lz0*strideZ, idx_y0_z1=offset_y0+(lz0-1)*strideZ;
const idx_y1_z0=offset_y1+lz0*strideZ, idx_y1_z1=offset_y1+(lz0-1)*strideZ;
const currentZ=(lz0+minZ-1)*size_xz;
let inLine=false, startX=0, globalX=0;

for (let wordX=0; wordX < dimX32; wordX++, globalX += 32) {
const edgeMask=bitVolume32[idx_y0_z0+wordX] | bitVolume32[idx_y0_z1+wordX] | bitVolume32[idx_y1_z0+wordX] | bitVolume32[idx_y1_z1+wordX];
for (let b=0; b < 32; b++) {
const realX=globalX+b+minX-1;
if(realX > endXCoord) break;
if((edgeMask & (1 << b)) !== 0) { if(!inLine) { startX=realX*size_xz; inLine=true; } }
else if(inLine) { positionsBuffer[posIdx++]=startX; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=currentZ; positionsBuffer[posIdx++]=realX*size_xz; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=currentZ; inLine=false; }
}
}
if(inLine) { positionsBuffer[posIdx++]=startX; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=currentZ; positionsBuffer[posIdx++]=endXCoord*size_xz; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=currentZ; }
}
}


// 3. СКАНИРОВАНИЕ ПО ОСИ Z
for (let ly0=sLy; ly0 <= eLy; ly0++) {
const offset_y0=ly0*strideY, offset_y1=(ly0-1)*strideY, currentY=(ly0+minY-1)*size_y;
for (let lx0=minX; lx0 <= endXCoord; lx0++) {
const locX0=lx0-minX+1, locX1=locX0-1, currentX=lx0*size_xz;
const wX0=locX0 >> 5, bX0=1 << (locX0 & 31), wX1=locX1 >> 5, bX1=1 << (locX1 & 31);
let inLine=false, startZ=0;

for (let lz=sLz; lz <= eLz-1; lz++) {
const offset_z=lz*strideZ;
const edgeActive=((bitVolume32[offset_y0+offset_z+wX0] & bX0) | (bitVolume32[offset_y0+offset_z+wX1] & bX1) | (bitVolume32[offset_y1+offset_z+wX0] & bX0) | (bitVolume32[offset_y1+offset_z+wX1] & bX1)) !== 0;
if(edgeActive) { if(!inLine) { startZ=(lz+minZ-1)*size_xz; inLine=true; } }
else if(inLine) { positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=startZ; positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=(lz+minZ-1)*size_xz; inLine=false; }
}
if(inLine) { positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=startZ; positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=(maxZ+1)*size_xz; }
}
}


// 4. СКАНИРОВАНИЕ ПО ОСИ Y
for (let lz0=sLz; lz0 <= eLz; lz0++) {
const offset_z0=lz0*strideZ, offset_z1=(lz0-1)*strideZ, currentZ=(lz0+minZ-1)*size_xz;
for (let lx0=minX; lx0 <= endXCoord; lx0++) {
const locX0=lx0-minX+1, locX1=locX0-1, currentX=lx0*size_xz;
const wX0=locX0 >> 5, bX0=1 << (locX0 & 31), wX1=locX1 >> 5, bX1=1 << (locX1 & 31);
let inLine=false, startY=0;

for (let ly=sLy; ly <= eLy-1; ly++) {
const offset_y=ly*strideY;
const edgeActive=((bitVolume32[offset_y+offset_z0+wX0] & bX0) | (bitVolume32[offset_y+offset_z0+wX1] & bX1) | (bitVolume32[offset_y+offset_z1+wX0] & bX0) | (bitVolume32[offset_y+offset_z1+wX1] & bX1)) !== 0;
if(edgeActive) { if(!inLine) { startY=(ly+minY-1)*size_y; inLine=true; } }
else if(inLine) { positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=startY; positionsBuffer[posIdx++]=currentZ; positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=(ly+minY-1)*size_y; positionsBuffer[posIdx++]=currentZ; inLine=false; }
}
if(inLine) { positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=startY; positionsBuffer[posIdx++]=currentZ; positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=(maxY+1)*size_y; positionsBuffer[posIdx++]=currentZ; }
}
}


const geometry=new BufferGeometry();
geometry.setAttribute('position', new BufferAttribute(positionsBuffer.subarray(0, posIdx), 3));
console.log("create_navigation_spatial_helper: "+(performance.now()-start_time).toFixed(2)+"ms "+"Ячеек: "+count+". Было бы рёбер: "+(count*12)+", оптимизировано до: "+(posIdx / 6));
return new LineSegments(geometry, new LineBasicMaterial({ color }));


}


// ____________________ navigation_spatial_clear ____________________


static navigation_spatial_clear(scene,item){
scene.remove(item);
item.geometry.dispose();
item.material.dispose();
item=null;
}


// ____________________ create_navigation_detail_mesh_helper ____________________


static create_navigation_detail_mesh_helper(nodes,offset_y,color=0x009000){


let start_time=performance.now();


const positions=[];


for(let i=0;i<nodes.length;i++){
const node=nodes[i];
positions.push(node.ax,node.ay,node.az);
positions.push(node.bx,node.by,node.bz);
positions.push(node.cx,node.cy,node.cz);
}


const geometry=new BufferGeometry();
geometry.setAttribute("position",new Float32BufferAttribute(positions,3));
geometry.computeVertexNormals();


let mesh=new Mesh(geometry,new MeshBasicMaterial({color:color,side:DoubleSide}));
mesh.position.y=offset_y;


console.log("create_navigation_detail_mesh_helper: "+(performance.now()-start_time).toFixed(2)+"ms");


return mesh;


}


// ____________________ create_navigation_abyss_helper ____________________


static create_navigation_abyss_helper(graph,vertices,offset_y){


let start_time=performance.now();


const points=[];


for (let i=0; i < graph.length; i++) {
const triangle=graph[i];
const v_ids=triangle.vertex_ids;


const vertexA=vertices[v_ids[0]];
const vertexB=vertices[v_ids[1]];
const vertexC=vertices[v_ids[2]];

// РЕБРО 0: Отрезок AB (Вершина 0 -> Вершина 1)
if(triangle.ab_is_abyss && vertexA && vertexB) {
points.push(
{x:vertexA.x,y:vertexA.y,z:vertexA.z},
{x:vertexB.x,y:vertexB.y,z:vertexB.z}
);
}

// РЕБРО 1: Отрезок BC (Вершина 1 -> Вершина 2)
if(triangle.bc_is_abyss && vertexB && vertexC) {
points.push(
{x:vertexB.x,y:vertexB.y,z:vertexB.z},
{x:vertexC.x,y:vertexC.y,z:vertexC.z}
);
}

// РЕБРО 2: Отрезок CA (Вершина 2 -> Вершина 0)
if(triangle.ca_is_abyss && vertexC && vertexA) {
points.push(
{x:vertexC.x,y:vertexC.y,z:vertexC.z},
{x:vertexA.x,y:vertexA.y,z:vertexA.z}
);
}
}

if(points.length === 0) {
 return new Group();
}


const abyssLines=new LineSegments(new BufferGeometry().setFromPoints(points),new LineBasicMaterial({color:0xffffff}));
abyssLines.position.y=offset_y;


console.log("create_navigation_abyss_helper: "+(performance.now()-start_time).toFixed(2)+"ms");


return abyssLines;


}


// ____________________ create_navigation_nodes_labels_helper ____________________


static create_navigation_nodes_labels_helper(graph,text_scale,offset_y){


let start_time=performance.now();


const totalNodes=graph.length;


const labelSize=128; 
const digitSpacingPixels=58; 
const digitWidth=0.045*text_scale; 
const digitHeight=digitWidth*1.5; 

const canvas=document.createElement("canvas");
canvas.width=10*labelSize; 
canvas.height=labelSize; 
const ctx=canvas.getContext("2d");

ctx.font=`bold ${Math.floor(labelSize*0.85)}px monospace`; 
ctx.textAlign="center";
ctx.textBaseline="middle";

const halfSize=labelSize*0.5;
const strokeWidth=Math.floor(labelSize*0.12);
for (let d=0; d < 10; d++) {
const x=d*labelSize+halfSize;
ctx.strokeStyle="#000000";
ctx.lineWidth=strokeWidth;
ctx.lineJoin="round";
ctx.strokeText(d, x, halfSize);
ctx.fillStyle="#00ffcc";
ctx.fillText(d, x, halfSize);
}

const texture=new CanvasTexture(canvas);
texture.minFilter=LinearFilter; 
texture.magFilter=LinearFilter;
texture.generateMipmaps=false; 
texture.premultiplyAlpha=false;
texture.needsUpdate=true;

// ВОЗВРАЩЕНО И ИСПРАВЛЕНО: Явное создание базовой геометрии, 
// чтобы InstancedBufferGeometry скопировал корректные атрибуты
const geoCombined=new PlaneGeometry(digitWidth, digitHeight);

const instanceIds=new Float32Array(totalNodes); 
const instanceLengths=new Float32Array(totalNodes); 

const instancedGeo=new InstancedBufferGeometry().copy(geoCombined);
instancedGeo.setAttribute("instanceId", new InstancedBufferAttribute(instanceIds, 1));
instancedGeo.setAttribute("instanceLength", new InstancedBufferAttribute(instanceLengths, 1));

const material=new MeshBasicMaterial({
map: texture,
transparent: true,
side: DoubleSide,
depthTest: true,
depthWrite: false
});

const textPaddingFactor=(1.0-(digitSpacingPixels/labelSize)).toFixed(3);
const textOffsetFactor=((digitSpacingPixels/labelSize)/2.0).toFixed(3);

material.onBeforeCompile=(shader) => {
shader.vertexShader=`
attribute float instanceId;
attribute float instanceLength;
varying float vId;
varying float vLength;
${shader.vertexShader}
`.replace(
"#include <uv_vertex>",
`
#include <uv_vertex>
vId=instanceId;
vLength=instanceLength;
`
);

shader.fragmentShader=`
varying float vId;
varying float vLength;
${shader.fragmentShader}
`.replace(
"#include <map_fragment>",
`
float totalDigits=floor(vLength+0.5);
float currentDigitIdx=floor(vMapUv.x*totalDigits); 
float localUvX=fract(vMapUv.x*totalDigits); 
float tightUvX=localUvX*${textPaddingFactor}+${textOffsetFactor}; 

float power=totalDigits-1.0-currentDigitIdx;
float reducedId=floor((vId+0.5)/pow(10.0, power));
float currentDigit=mod(floor(reducedId+0.5), 10.0);

vec2 atlasUV=vec2((currentDigit+tightUvX)/10.0, vMapUv.y);
diffuseColor=texture2D(map, atlasUV);
`
);
};


const instancedMesh=new InstancedMesh(instancedGeo, material, totalNodes);
const dummyMatrix=new Matrix4();
const position={x:0,y:0,z:0};
const rotation=new Quaternion();
const scale={x:1,y:1,z:1};

const upVector=new Vector3(0,0,1); 
const triangleNormal={x:0,y:0,z:0};


for (let i=0; i < totalNodes; i++) {
const node=graph[i];


position.x=node.centroid_x;
position.y=node.centroid_y;
position.z=node.centroid_z;


triangleNormal.x=node.nx;
triangleNormal.y=node.ny;
triangleNormal.z=node.nz;


rotation.setFromUnitVectors(upVector, triangleNormal);


const cleanId=node.id;
const textLength=Math.min(String(cleanId).length, 6);


instanceIds[i]=cleanId; 
instanceLengths[i]=textLength; 

scale.x=textLength;
dummyMatrix.compose(position, rotation, scale);
instancedMesh.setMatrixAt(i, dummyMatrix);
}

instancedMesh.position.y += offset_y;


console.log("create_navigation_nodes_labels_helper: "+(performance.now()-start_time).toFixed(2)+"ms");


return instancedMesh;


}


}

export {navigation_helper};