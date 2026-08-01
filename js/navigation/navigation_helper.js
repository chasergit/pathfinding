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


const navigation_grid_shift_x=17179869184; // 2^34
const navigation_grid_shift_z=131072; // 2^17
const navigation_grid_offset=65536; // СИММЕТРИЧНЫЙ СДВИГ ВО ВСЕ СТОРОНЫ КУБА


class navigation_helper{


static create_convex_polygon_helper(finalPolygons,offset_y) {
const positions=[];
const colors=[];

for (let i=0; i < finalPolygons.length; i++) {
const poly=finalPolygons[i];
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


return mesh;

		
}
	

static create_graph_helper(finalPolygons,offset_y,scale,lines_color=0xffffff,centroids_color=0x4e84c4){
	
	
const group=new Group();
const linePositions=[];
const numPolygons=finalPolygons.length;


// Набор для защиты от дублирования линий связей А->В и В->А
const renderedPairs=new Set();


const instanced_mesh=new InstancedMesh(new BoxGeometry(0.03*scale,0.03*scale,0.03*scale), new MeshBasicMaterial({ color:centroids_color }), numPolygons);


let instanced_mesh_instanceMatrix_array=instanced_mesh.instanceMatrix.array;


for (let i=0; i < numPolygons; i++) {
	
	
const poly=finalPolygons[i];
const cA=poly.centroid;


let offset=i*16;
instanced_mesh_instanceMatrix_array[offset+12]=cA.x;
instanced_mesh_instanceMatrix_array[offset+13]=cA.y;
instanced_mesh_instanceMatrix_array[offset+14]=cA.z;


// --- 2. СБОРКА ЛИНИЙ СВЯЗЕЙ ---
const neighbours=poly.neighbours || [];
for (let j=0; j < neighbours.length; j++) {
const neighbourId=neighbours[j];
const polyB=finalPolygons[neighbourId];

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


return group;


}
	
	
// Буфер объема теперь хранит 32-битные слова. Размер по оси X уменьшается в 32 раза!
static _nav_vis_bit_volume_32=new Int32Array(512);
static _nav_vis_positions_buffer=new Float32Array(1024);

static navigation_grid_visualize(navGrid, color=0x00ff00) {
const start_time=performance.now();

const count=navGrid.cells_array.size;
if (count === 0) return null;

const minX=navGrid.cells_min_x_num; const maxX=navGrid.cells_max_x_num;
const minZ=navGrid.cells_min_z_num; const maxZ=navGrid.cells_max_z_num;
const minY=navGrid.cells_min_y_num; const maxY=navGrid.cells_max_y_num;

// Ось X округляем вверх до кратности 32 ячейкам+делаем отступы безопасности
const rawDimX=(maxX-minX)+3;
const dimX32=((rawDimX+31) >> 5)+1; // Сколько 32-битных слов нужно на одну строку X
const dimZ=(maxZ-minZ)+3;
const dimY=(maxY-minY)+3;
const totalVolumeSize32=dimX32 * dimZ * dimY;

if (totalVolumeSize32 > this._nav_vis_bit_volume_32.length) {
this._nav_vis_bit_volume_32=new Int32Array(totalVolumeSize32 * 2);
}

const maxFloatCapacity=count * 72; 
if (maxFloatCapacity > this._nav_vis_positions_buffer.length) {
this._nav_vis_positions_buffer=new Float32Array(maxFloatCapacity * 2);
}

const bitVolume32=this._nav_vis_bit_volume_32;
bitVolume32.fill(0, 0, totalVolumeSize32);

const positionsBuffer=this._nav_vis_positions_buffer;
let posIdx=0;

const strideZ=dimX32;
const strideY=dimX32 * dimZ;

const shiftX=navigation_grid_shift_x;
const shiftZ=navigation_grid_shift_z;
const offset=navigation_grid_offset;

const size_xz=navGrid.cells_size_xz;
const size_y=navGrid.cells_size_y;

// 1. ФАЗА КЭШИРОВАНИЯ: Упаковка кубиков в 32-битные битовые карты (Bitboards)
const keysIterator=navGrid.cells_array.keys();
let iteratorResult=keysIterator.next();

while (!iteratorResult.done) {
const cell_key=iteratorResult.value;

const x_shifted=(cell_key/shiftX) | 0;
const z_shifted=((cell_key % shiftX)/shiftZ) | 0;
const y_shifted=cell_key % shiftZ;

const locX=(x_shifted-offset)-minX+1;
const locZ=(z_shifted-offset)-minZ+1;
const locY=(y_shifted-offset)-minY+1;

// Вычисляем, в какое именно 32-битное слово попадает координата X
const wordX=locX >> 5;   // locX/32
const bitX=locX & 31;// locX % 32

const bitIdx=locY * strideY+locZ * strideZ+wordX;
bitVolume32[bitIdx] |= (1 << bitX); // Устанавливаем нужный бит в 1

iteratorResult=keysIterator.next();
}

const sLy=1; const eLy=(maxY-minY)+2;
const sLz=1; const eLz=(maxZ-minZ)+2;
const endXCoord=maxX+1;

// 2. СКАНИРОВАНИЕ ПО ОСИ X ЧЕРЕЗ БИТОВЫЕ МАСКИ
for (let ly0=sLy; ly0 <= eLy; ly0++) {
const offset_y0=ly0 * strideY;
const offset_y1=(ly0-1) * strideY;
const currentY=(ly0+minY-1) * size_y;

for (let lz0=sLz; lz0 <= eLz; lz0++) {
const lz1=lz0-1;
const idx_y0_z0=offset_y0+lz0 * strideZ;
const idx_y0_z1=offset_y0+lz1 * strideZ;
const idx_y1_z0=offset_y1+lz0 * strideZ;
const idx_y1_z1=offset_y1+lz1 * strideZ;
const currentZ=(lz0+minZ-1) * size_xz;

let inLine=false;
let startX=0;
let globalX=0;

// Итерируемся сразу по 32-битным словам, а не по одиночным кубам!
for (let wordX=0; wordX < dimX32; wordX++) {
// Объединяем 4 соседних ряда кубов в одну маску ребер за 3 операции ИЛИ
const edgeMask=bitVolume32[idx_y0_z0+wordX] | 
 bitVolume32[idx_y0_z1+wordX] | 
 bitVolume32[idx_y1_z0+wordX] | 
 bitVolume32[idx_y1_z1+wordX];

// Обрабатываем 32 бита текущего слова
for (let b=0; b < 32; b++) {
const lx=globalX+b;
const realX=lx+minX-1;
if (realX > endXCoord) break;

const edgeActive=(edgeMask & (1 << b)) !== 0;

if (edgeActive) {
if (!inLine) {
startX=realX * size_xz;
inLine=true;
}
} else {
if (inLine) {
positionsBuffer[posIdx++]=startX; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=currentZ;
positionsBuffer[posIdx++]=realX * size_xz; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=currentZ;
inLine=false;
}
}
}
globalX += 32;
}
if (inLine) {
positionsBuffer[posIdx++]=startX; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=currentZ;
positionsBuffer[posIdx++]=endXCoord * size_xz; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=currentZ;
}
}
}

// 3. СКАНИРОВАНИЕ ПО ОСИ Z ЧЕРЕЗ БИТОВЫЕ МАСКИ
for (let ly0=sLy; ly0 <= eLy; ly0++) {
const offset_y0=ly0 * strideY;
const offset_y1=(ly0-1) * strideY;
const currentY=(ly0+minY-1) * size_y;

for (let lx0=minX; lx0 <= endXCoord; lx0++) {
const locX0=lx0-minX+1;
const locX1=locX0-1;
const currentX=lx0 * size_xz;

const wX0=locX0 >> 5;  const bX0=locX0 & 31;
const wX1=locX1 >> 5;  const bX1=locX1 & 31;
const mask0=1 << bX0;  const mask1=1 << bX1;

let inLine=false;
let startZ=0;

for (let lz=sLz; lz <= eLz-1; lz++) {
const offset_z=lz * strideZ;

// Извлекаем состояние ребер из битовых масок
const edgeActive=((bitVolume32[offset_y0+offset_z+wX0] & mask0) |
(bitVolume32[offset_y0+offset_z+wX1] & mask1) |
(bitVolume32[offset_y1+offset_z+wX0] & mask0) |
(bitVolume32[offset_y1+offset_z+wX1] & mask1)) !== 0;

if (edgeActive) {
if (!inLine) {
startZ=(lz+minZ-1) * size_xz;
inLine=true;
}
} else {
if (inLine) {
positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=startZ;
positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=(lz+minZ-1) * size_xz;
inLine=false;
}
}
}
if (inLine) {
positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=startZ;
positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=currentY; positionsBuffer[posIdx++]=(maxZ+1) * size_xz;
}
}
}

// 4. СКАНИРОВАНИЕ ПО ОСИ Y ЧЕРЕЗ БИТОВЫЕ МАСКИ
for (let lz0=sLz; lz0 <= eLz; lz0++) {
const offset_z0=lz0 * strideZ;
const offset_z1=(lz0-1) * strideZ;
const currentZ=(lz0+minZ-1) * size_xz;

for (let lx0=minX; lx0 <= endXCoord; lx0++) {
const locX0=lx0-minX+1;
const locX1=locX0-1;
const currentX=lx0 * size_xz;

const wX0=locX0 >> 5;  const bX0=locX0 & 31;
const wX1=locX1 >> 5;  const bX1=locX1 & 31;
const mask0=1 << bX0;  const mask1=1 << bX1;

let inLine=false;
let startY=0;

for (let ly=sLy; ly <= eLy-1; ly++) {
const offset_y=ly * strideY;

const edgeActive=((bitVolume32[offset_y+offset_z0+wX0] & mask0) |
(bitVolume32[offset_y+offset_z0+wX1] & mask1) |
(bitVolume32[offset_y+offset_z1+wX0] & mask0) |
(bitVolume32[offset_y+offset_z1+wX1] & mask1)) !== 0;

if (edgeActive) {
if (!inLine) {
startY=(ly+minY-1) * size_y;
inLine=true;
}
} else {
if (inLine) {
positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=startY; positionsBuffer[posIdx++]=currentZ;
positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=(ly+minY-1) * size_y; positionsBuffer[posIdx++]=currentZ;
inLine=false;
}
}
}
if (inLine) {
positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=startY; positionsBuffer[posIdx++]=currentZ;
positionsBuffer[posIdx++]=currentX; positionsBuffer[posIdx++]=(maxY+1) * size_y; positionsBuffer[posIdx++]=currentZ;
}
}
}

const finalPositionsView=positionsBuffer.subarray(0, posIdx);
const finalLinesCount=posIdx/6;

const geometry=new BufferGeometry();
geometry.setAttribute('position', new BufferAttribute(finalPositionsView, 3));
const material=new LineBasicMaterial({ color:color });

console.log("Навигационная сетка. Ячеек: "+count+". Было бы рёбер: "+(count*12)+". Оптимизировано до уникальных линий: "+finalLinesCount+". Время: "+(performance.now()-start_time).toFixed(4)+" мс");


return new LineSegments(geometry, material);
}


static navigation_grid_clear(scene,item){
scene.remove(item);
item.geometry.dispose();
item.material.dispose();
item=null;
}
	


static createAbyssEdgesVisual(graph,vertices,offset_y){
const points=[];

for (let i=0; i < graph.length; i++) {
const triangle=graph[i];
const v_ids=triangle.vertex_ids;


const vertexA=vertices[v_ids[0]];
const vertexB=vertices[v_ids[1]];
const vertexC=vertices[v_ids[2]];

// РЕБРО 0: Отрезок AB (Вершина 0 -> Вершина 1)
if (triangle.ab_is_abyss && vertexA && vertexB) {
points.push(
			{x:vertexA.x,y:vertexA.y,z:vertexA.z},
{x:vertexB.x,y:vertexB.y,z:vertexB.z}
);
}

// РЕБРО 1: Отрезок BC (Вершина 1 -> Вершина 2)
if (triangle.bc_is_abyss && vertexB && vertexC) {
points.push(
			{x:vertexB.x,y:vertexB.y,z:vertexB.z},
		{x:vertexC.x,y:vertexC.y,z:vertexC.z}
);
}

// РЕБРО 2: Отрезок CA (Вершина 2 -> Вершина 0)
if (triangle.ca_is_abyss && vertexC && vertexA) {
points.push(
			{x:vertexC.x,y:vertexC.y,z:vertexC.z},
		{x:vertexA.x,y:vertexA.y,z:vertexA.z}
);
}
}

if (points.length === 0) {
 return new Group();
}


const geometry=new BufferGeometry().setFromPoints(points);

const material=new LineBasicMaterial({
color: 0xffffff,
});

const abyssLines=new LineSegments(geometry, material);
abyssLines.position.y=offset_y;

return abyssLines;
}
	
	
static create_nodes_labels(graph,text_scale,offset_y){
	
	
const totalNodes=graph.length;


const labelSize=128; 
const digitSpacingPixels=58; 
const digitWidth=0.045*text_scale; 
const digitHeight=digitWidth * 1.5; 

const canvas=document.createElement("canvas");
canvas.width=10 * labelSize; 
canvas.height=labelSize; 
const ctx=canvas.getContext("2d");

ctx.font=`bold ${Math.floor(labelSize * 0.85)}px monospace`; 
ctx.textAlign="center";
ctx.textBaseline="middle";

const halfSize=labelSize * 0.5;
const strokeWidth=Math.floor(labelSize * 0.12);
for (let d=0; d < 10; d++) {
const x=d * labelSize+halfSize;
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
float currentDigitIdx=floor(vMapUv.x * totalDigits); 
float localUvX=fract(vMapUv.x * totalDigits); 
float tightUvX=localUvX * ${textPaddingFactor}+${textOffsetFactor}; 

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





return instancedMesh;
}	
	
	
}

export {navigation_helper};