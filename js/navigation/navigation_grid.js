/**


ОТСТУП padding_xz И padding_y ИСКУССТВЕННО РАСШИРЯЮТ ТРЕУГОЛЬНИКИ ВО ВСЕ СТОРОНЫ,
ЧТОБЫ ОНИ ГАРАНТИРОВАННО ЗАХОДИЛИ В СОСЕДНИЕ ЯЧЕЙКИ СЕТКИ И НАХОДИЛИСЬ ПРИ ПРОВЕРКЕ НАХОЖДЕНИЯ ТОЧКИ В ТРЕУГОЛЬНИКЕ И Т.Д.
padding_xz=0.01; // РАЗМЕР ЯЧЕЙКИ ПО XZ. ДОСТАТОЧНО 0.01, ЕСЛИ БОТ ОТОШЁЛ ОТ ГРАНИЦЫ ТРЕУГОЛЬНИКА МАКСИМУМ НА 0.01, А ЕСЛИ БОЛЬШЕ, ТО УЖЕ НЕ НАЙДЁТ, Т.К. В ТОЙ ЯЧЕЙКЕ МОЖЕТ НЕ ОКАЗАТЬСЯ ТРЕУГОЛЬНИКА 
padding_y=0.001; // РАЗМЕР ЯЧЕЙКИ ПО Y. ДОСТАТОЧНО 0.001, ЧТОБЫ ЗАХВАТИЛО ВЕРХНЮЮ И НИЖНЮЮ ЯЧЕЙКУ 


ИСПОЛЬЗУЕМ new Map() ВМЕСТО new Array() ДЛЯ ОПТИМИЗАЦИИ РАЗРЕЖЕННОЙ СЕТКИ (SPARSE GRID).
ЕСЛИ ЗАНЯТЫ ТОЛЬКО КЛЮЧИ 1 И 1.000.000, new Map() СОЗДАСТ РОВНО 2 ЗАПИСИ В ПАМЯТИ RAM.
ОБЫЧНЫЙ МАССИВ ПРИ ТАКИХ ГИГАНТСКИХ ДЫРАХ ТЕРЯЕТ РЕЖИМ FAST ELEMENTS И ДЕОПТИМИЗИРУЕТСЯ ДВИЖКОМ V8,
ПРЕВРАЩАЯСЬ В МЕДЛЕННЫЙ СЛОВАРЬ (DICTIONARY ELEMENTS) И РЕЗКО СНИЖАЯ СКОРОСТЬ НАВИГАЦИИ.


BigInt С ПОБИТОВЫМ СДВИГОМ ПОЗВОЛЯЕТ ИСПОЛЬЗОВАТЬ КАРТУ РАЗМЕРОМ 210х210х210км С РАЗМЕРОМ ЯЧЕЙКИ 10см, НО ПРОИГРЫВАЕТ ПО СКОРОСТИ ТИПУ Number С ПОБИТОВЫМ СДВИГОМ.
КОД ЯЧЕЙКИ ДЛЯ BIGINT БЫЛ ТАКИМ: const offset=1000000; let cell_key=(BigInt(x+offset)<<42n) | (BigInt(z+offset)<<21n) | BigInt(y+offset);
BigInt выигрывает у строкового и Number вариантов для карты 210х210х210км с шагом сетки 10 см по скорости, отсутствию нагрузки на сборщика мусора (Garbage Collector)


ПРИ СИММЕТРИЧНЫХ СДВИГАХ << 42n И << 21n СЕТКА ВЫДЕЛЯЕТ РОВНО ПО 21 БИТУ НА КАЖДУЮ ОСЬ (X, Z, Y).
ПРИ OFFSET = 1000000 И ШАГЕ СЕТКИ 10 СМ (0.1 М), ИГРОВОЙ МИР ПОЛУЧАЕТ АБСОЛЮТНО СИММЕТРИЧНЫЙ И РАВНЫЙ ЗАПАС:
ЗАПАС КООРДИНАТ ПО ВСЕМ НАПРАВЛЕНИЯМ (X, Z, Y) СОСТАВЛЯЕТ ОТ -1.000.000 ДО +1.097.151 ЯЧЕЕК.
В ПЕРЕВОДЕ НА ФИЗИЧЕСКИЙ МАСШТАБ МИР СТАБИЛЬНО РАБОТАЕТ В СЛЕДУЮЩИХ КУБИЧЕСКИХ ДИАПАЗОНАХ:
ПО ОСЯМ X И Z: СТРОГО ОТ -100 КИЛОМЕТРОВ ДО +109 КИЛОМЕТРОВ ОТ НУЛЕВОГО ЦЕНТРА КАРТЫ.
ПО ОСИ Y (ВЫСОТА): СТРОГО ОТ -100 КИЛОМЕТРОВ ДО +109 КИЛОМЕТРОВ ВВЕРХ И ВНИЗ ОТ НУЛЯ.
ЭТО СОЗДАЕТ ИДЕАЛЬНЫЙ СИММЕТРИЧНЫЙ КУБ НАВИГАЦИИ 210 км х 210 км х 210 км ДЛЯ БЕСШОВНЫХ MMO-МИРОВ.


СЕЙЧАС СТОИТ ВАРИАНТ Number С ПОБИТОВЫМ СДВИГОМ. ЕГО ХВАТАЕТ НА КАРТУ РАЗМЕРОМ 13.1072*13.1072*13.1072КМ, Т.Е. -6.5536КМ И 6.5536КМ ВПРАВО С РАЗМЕРОМ ЯЧЕЙКИ 10СМ.
ЕСЛИ РАЗМЕР ЯЧЕЙКИ 1М, ТО ЭТОГО ХВАТАЕТ НА КАРТУ, РАЗМЕРОМ: 131.072*131.072*131.072КМ, Т.Е. -65.536КМ И 65.536КМ ВПРАВО.
const navigation_grid_shift_x=17179869184; // 2^34
const navigation_grid_shift_z=131072; // 2^17
const navigation_grid_offset=65536; // СИММЕТРИЧНЫЙ СДВИГ ВО ВСЕ СТОРОНЫ КУБА
ФОРМИРУЕМ 51-БИТНЫЙ ЧИСЛОВОЙ КЛЮЧ ЯЧЕЙКИ НА NUMBER:
const cell_key=(x+navigation_grid_offset)*navigation_grid_shift_x+(z+navigation_grid_offset)*navigation_grid_shift_z+(y+navigation_grid_offset);


ВАРИАНТ 1. ПЛОСКИЙ МАССИВ (CSR) ДЛЯ 3D Int32Array.
МЫ ПО-ПРЕЖНЕМУ ИСПОЛЬЗУЕМ ОДНОМЕРНЫЕ МАССИВЫ, НО ПЕРЕСЧИТЫВАЕМ 3D-КООРДИНАТЫ ЯЧЕЙКИ В ОДИН ПЛОСКИЙ ИНДЕКС (ОДНОМЕРНЫЙ АДРЕС В ПАМЯТИ).
ФОРМУЛА ИНДЕКСА: const cellIdx = x+(y * GRID_WIDTH)+(z * GRID_WIDTH * GRID_HEIGHT);
ПЛЮСЫ: РАБОТАЕТ НЕВЕРОЯТНО БЫСТРО, ДАННЫЕ В ПАМЯТИ ЛЕЖАТ СТРОГО ДРУГ ЗА ДРУГОМ.
МИНУСЫ В 3D: ЕСЛИ МИР ВЫСОКИЙ (НАПРИМЕР, 100 СЛОЁВ ВЫСОТЫ), МАССИВ OFFSETS СТАНЕТ РАЗМЕРОМ В 1.6 МИЛЛИАРДА ЭЛЕМЕНТОВ.
ЭТО ЗАЙМЕТ ~6 ГБ RAM ТОЛЬКО ПОД ПУСТЫЕ ИНДЕКСЫ.
ВЫВОД: ПОДХОДИТ ТОЛЬКО ДЛЯ "ПЛОСКИХ" МИРОВ С МАЛЫМ КОЛИЧЕСТВОМ СЛОЁВ ВЫСОТЫ.
ВАРИАНТ 2. MAP С УПАКОВАННЫМ 3D-КЛЮЧОМ (ИДЕАЛЬНО ДЛЯ 3D NAVMESH)
ДЛЯ 3D-СРЕД ЭТОТ ВАРИАНТ СТАНОВИТСЯ АБСОЛЮТНЫМ ФАВОРИТОМ.
ПОСКОЛЬКУ NAVMESH ПОКРЫВАЕТ ТОЛЬКО ПОВЕРХНОСТИ (ЗЕМЛЮ, ПОЛ, МОСТЫ), 95% ПРОСТРАНСТВА ПО ВЫСОТЕ — ЭТО ПУСТОТА.
MAP ПОЗВОЛЯЕТ ВООБЩЕ НЕ ТРАТИТЬ ПАМЯТЬ НА ПУСТЫЕ ЯЧЕЙКИ ВОЗДУХА.
МЫ УПАКОВЫВАЕМ X, Y И Z В ОДНО 51-БИТНОЕ ЧИСЛО (Number).


**/


class navigation_grid{


build(nodes,vertices,padding_xz=0.005,padding_y=0.005,cells_size_xz=1,cells_size_y=1){


let start_time=performance.now();


this.cells_array=new Map(); // МАССИВ ЯЧЕЕК С НОМЕРАМИ ТРЕУГОЛЬНИКОВ ДЛЯ РАЗРЕЖЕННОЙ 3D-СЕТКИ (SPARSE GRID) 
this.cells_count=0; // КОЛИЧЕСТВО ЯЧЕЕК


this.cells_size_xz=cells_size_xz;
this.cells_size_y=cells_size_y;


// СБРАСЫВАЕМ ГЛОБАЛЬНЫЕ ГРАНИЦЫ В МЕТРАХ
this.cells_min_x_meter=Infinity; // LEFT
this.cells_max_x_meter=-Infinity; // RIGHT
this.cells_min_z_meter=Infinity; // TOP
this.cells_max_z_meter=-Infinity; // BOTTOM
this.cells_min_y_meter=Infinity; // LOW, DOWN
this.cells_max_y_meter=-Infinity; // HIGH, UP


// СБРАСЫВАЕМ ГЛОБАЛЬНЫЕ ГРАНИЦЫ ЯЧЕЕК В НОМЕРАХ ЯЧЕЕК
this.cells_min_x_num=0; // LEFT
this.cells_max_x_num=0; // RIGHT
this.cells_min_z_num=0; // TOP
this.cells_max_z_num=0; // BOTTOM
this.cells_min_y_num=0; // LOW, DOWN
this.cells_max_y_num=0; // HIGH, UP


// Заменяем: let margin_xz = padding_xz * padding_xz;
// На честный радиус ячейки + padding_xz (в метрах)
const cell_radius_xz=Math.sqrt((cells_size_xz/2)**2+(cells_size_xz/2)**2)+padding_xz;
const margin_xz=cell_radius_xz*cell_radius_xz;
	
	
// БЕЗОПАСНОЕ СМЕЩЕНИЕ, ЧТОБЫ УВЕСТИ ЛЮБЫЕ МИНУСЫ В ПЛЮС
const navigation_grid_shift_x=17179869184; // 2^34
const navigation_grid_shift_z=131072; // 2^17
const navigation_grid_offset=65536; // СИММЕТРИЧНЫЙ СДВИГ ВО ВСЕ СТОРОНЫ КУБА


// ПОЛУРАДИУСЫ ЯЧЕЙКИ (РАССТОЯНИЯ ОТ ЦЕНТРА ДО ГРАНЕЙ)
const hx=cells_size_xz/2;
const hz=cells_size_xz/2;
const hy=cells_size_y/2;


for(let j=0;j<nodes.length;j++){
	
	
let	node=nodes[j];
let v_ids=node.vertex_ids;


let p1=vertices[v_ids[0]];
let p2=vertices[v_ids[1]];
let p3=vertices[v_ids[2]];


let p1_x=p1.x;
let p1_y=p1.y;
let p1_z=p1.z;
let p2_x=p2.x;
let p2_y=p2.y;
let p2_z=p2.z;
let p3_x=p3.x;
let p3_y=p3.y;
let p3_z=p3.z;


// 1. ОПРЕДЕЛЯЕМ ПЕРВИЧНЫЕ ГРАНИЦЫ ТРЕУГОЛЬНИКА (AABB)
let min_x=p1_x; if(p2_x<min_x){ min_x=p2_x; } if(p3_x<min_x){ min_x=p3_x; } // LEFT
let max_x=p1_x; if(p2_x>max_x){ max_x=p2_x; } if(p3_x>max_x){ max_x=p3_x; } // RIGHT
let min_z=p1_z; if(p2_z<min_z){ min_z=p2_z; } if(p3_z<min_z){ min_z=p3_z; } // TOP
let max_z=p1_z; if(p2_z>max_z){ max_z=p2_z; } if(p3_z>max_z){ max_z=p3_z; } // BOTTOM
let min_y=p1_y; if(p2_y<min_y){ min_y=p2_y; } if(p3_y<min_y){ min_y=p3_y; } // LOW, DOWN
let max_y=p1_y; if(p2_y>max_y){ max_y=p2_y; } if(p3_y>max_y){ max_y=p3_y; } // HIGH, UP


// ОБНОВЛЯЕМ ГЛОБАЛЬНЫЕ ГРАНИЦЫ ЯЧЕЕК
if(min_x<this.cells_min_x_meter){ this.cells_min_x_meter=min_x; } // LEFT
if(max_x>this.cells_max_x_meter){ this.cells_max_x_meter=max_x; } // RIGHT
if(min_z<this.cells_min_z_meter){ this.cells_min_z_meter=min_z; } // TOP
if(max_z>this.cells_max_z_meter){ this.cells_max_z_meter=max_z; } // BOTTOM
if(min_y<this.cells_min_y_meter){ this.cells_min_y_meter=min_y; } // LOW, DOWN
if(max_y>this.cells_max_y_meter){ this.cells_max_y_meter=max_y; } // HIGH, UP


// 2. РАСШИРЯЕМ ГРАНИЦЫ НА ВЕЛИЧИНУ PADDING ДО ДЕЛЕНИЯ И ОКРУГЛЕНИЯ.
// МИНИМАЛЬНЫЕ ГРАНИЦЫ УМЕНЬШАЕМ (-), МАКСИМАЛЬНЫЕ УВЕЛИЧИВАЕМ (+).
let cell_min_x=Math.floor((min_x-padding_xz)/cells_size_xz); // LEFT
let cell_max_x=Math.floor((max_x+padding_xz)/cells_size_xz); // RIGHT
let cell_min_z=Math.floor((min_z-padding_xz)/cells_size_xz); // TOP
let cell_max_z=Math.floor((max_z+padding_xz)/cells_size_xz); // BOTTOM
let cell_min_y=Math.floor((min_y-padding_y)/cells_size_y); // LOW, DOWN
let cell_max_y=Math.floor((max_y+padding_y)/cells_size_y); // HIGH, UP


// 3. ТРЕХМЕРНЫЙ ЦИКЛ: РАСПРЕДЕЛЯЕМ ТРЕУГОЛЬНИК ПО МИКРО-ЯЧЕЙКАМ ПРОСТРАНСТВА
for(let x=cell_min_x;x<=cell_max_x;x++){
for(let z=cell_min_z;z<=cell_max_z;z++){


/** ОТСЕКАЕМ ПО XZ **/


let cx=(x+0.5)*cells_size_xz;
let cz=(z+0.5)*cells_size_xz;	


// СЧИТАЕМ ЗНАКОВЫЕ ПЛОЩАДИ ДЛЯ КАЖДОГО РЕБРА
const edge0=(cx-p1_x)*node.abz-(cz-p1_z)*node.abx;
const edge1=(cx-p2_x)*node.bcz-(cz-p2_z)*node.bcx;
const edge2=(cx-p3_x)*node.caz-(cz-p3_z)*node.cax;


// ТОЧКА ВНУТРИ ИЛИ СТРОГО НА ГРАНИЦЕ. ТРЕУГОЛЬНИКИ ЗАКРУЧЕНЫ ПО ЧАСОВОЙ СТРЕЛКЕ
let isStrictlyInside=edge0>=0 && edge1>=0 && edge2>=0;
// С УЧЁТОМ ОТСТУПА. ТОЧКА ВНУТРИ ИЛИ СТРОГО НА ГРАНИЦЕ. ТРЕУГОЛЬНИКИ ЗАКРУЧЕНЫ ПО ЧАСОВОЙ СТРЕЛКЕ
let isInsideWithMargin=false;
if(!isStrictlyInside){
isInsideWithMargin=(edge0>=0 || (edge0*edge0<=margin_xz*node.ab_length_sq_xz)) && (edge1>=0 || (edge1*edge1<=margin_xz*node.bc_length_sq_xz)) && (edge2>=0 || (edge2*edge2<=margin_xz*node.ca_length_sq_xz));
}
// ЕСЛИ ЯЧЕЙКА НЕ НАХОДИТСЯ ВНУТРИ И НЕ ПРОШЛА ТЕСТ ПО ОТСТУПАМ — УБИРАЕМ ЕЁ
if(!isStrictlyInside && !isInsideWithMargin) { continue; }


for(let y=cell_min_y;y<=cell_max_y;y++){


/** ОТСЕКАЕМ ПО Y **/


// НАХОДИМ ЦЕНТР ПРОВЕРЯЕМОГО КУБИКА
let cy=(y+0.5)*cells_size_y;
// ВЕКТОР ОТ ПЕРВОЙ ВЕРШИНЫ ТРЕУГОЛЬНИКА ДО ЦЕНТРА КУБА
let v_cx=cx-p1_x;
let v_cy=cy-p1_y;
let v_cz=cz-p1_z;
// РАССТОЯНИЕ ПО НОРМАЛИ ОТ ЦЕНТРА КУБА ДО ПЛОСКОСТИ ТРЕУГОЛЬНИКА
let distance=node.nx*v_cx+node.ny*v_cy+node.nz*v_cz;
// МАКСИМАЛЬНЫЙ РАДИУС ПРОЕКЦИИ КУБА НА НОРМАЛЬ ТРЕУГОЛЬНИКА
let radius=hx*node.abs_nx+hy*node.abs_ny+hz*node.abs_nz;
// ДОБАВЛЯЕМ ОТСТУП ИМЕННО ТАК
radius+=padding_y;
// ЕСЛИ РАССТОЯНИЕ ДО ПЛОСКОСТИ БОЛЬШЕ РАДИУСА ПРОЕКЦИИ КУБА, ЗНАЧИТ КУБИК НЕ ПЕРЕСЕКАЕТСЯ ТРЕУГОЛЬНИКОМ
if(Math.abs(distance)>radius){ continue; }


let cell_key=(x+navigation_grid_offset)*navigation_grid_shift_x+(z+navigation_grid_offset)*navigation_grid_shift_z+y+navigation_grid_offset;


let cell=this.cells_array.get(cell_key);
if(cell===undefined){ 
cell=[];
this.cells_array.set(cell_key,cell);
this.cells_count++;
}
cell.push(node.id);
}
}
}
}


if(this.cells_count>0){
	
	
this.cells_min_x_meter-=padding_xz;
this.cells_max_x_meter+=padding_xz;
this.cells_min_z_meter-=padding_xz;
this.cells_max_z_meter+=padding_xz;
this.cells_min_y_meter-=padding_y;
this.cells_max_y_meter+=padding_y;


this.cells_min_x_num=Math.floor(this.cells_min_x_meter/cells_size_xz);
this.cells_max_x_num=Math.floor(this.cells_max_x_meter/cells_size_xz);
this.cells_min_z_num=Math.floor(this.cells_min_z_meter/cells_size_xz);
this.cells_max_z_num=Math.floor(this.cells_max_z_meter/cells_size_xz);
this.cells_min_y_num=Math.floor(this.cells_min_y_meter/cells_size_y);
this.cells_max_y_num=Math.floor(this.cells_max_y_meter/cells_size_y);


}


console.log("Navigation_grid: "+(performance.now()-start_time));


}


}


export {navigation_grid};