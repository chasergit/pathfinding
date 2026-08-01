const open_heap=[];


// ____________________ sink_down ____________________


function sink_down(open_heap,n){


// ПОЛУЧАЕМ ЭЛЕМЕНТ, КОТОРЫЙ НЕОБХОДИМО ПОМЕСТИТЬ В ХРАНИЛИЩЕ.
const element=open_heap[n];
const element_f=element.f;


// КОГДА ЗНАЧЕНИЕ РАВНО 0, ЭЛЕМЕНТ НЕ МОЖЕТ ОПУСТИТЬСЯ НИЖЕ.
while(n>0){
// ВЫЧИСЛЯЕМ ИНДЕКС РОДИТЕЛЬСКОГО ЭЛЕМЕНТА И ПОЛУЧАЕМ ЕГО.
const parentN=((n+1)>>1)-1;
const parent=open_heap[parentN];


if(element_f<parent.f){
// МЕНЯЕМ МЕСТАМИ ЭЛЕМЕНТЫ, ЕСЛИ РОДИТЕЛЬСКИЙ ЭЛЕМЕНТ БОЛЬШЕ.
open_heap[parentN]=element;
open_heap[n]=parent;
// ОБНОВЛЯЕМ "n", ЧТОБЫ ПРОДОЛЖИТЬ С НОВОЙ ПОЗИЦИИ.
n=parentN;
}
else{
// НАЙДЕН РОДИТЕЛЬ, КОТОРЫЙ МЕНЬШЕ ПО РАЗМЕРУ, НЕТ НЕОБХОДИМОСТИ ОПУСКАТЬСЯ НИЖЕ.
break;
}
}


}
  

// ____________________ bubble_up ____________________


// ПЕРЕДЕЛАННЫЙ bubble_up, Т.К. МЫ ВСЕГДА ПЕРЕДАЁМ ЗНАЧЕНИЕ N=0

  
function bubble_up(open_heap){


// НАХОДИМ ЦЕЛЕВОЙ ЭЛЕМЕНТ И ЕГО ОЦЕНКУ
const length=open_heap.length;
// ЗАЩИТА ОТ ПУСТОЙ КУЧИ ИЛИ 1 ЭЛЕМЕНТА
if(length<=1){ return; }
const element=open_heap[0];
const elemScore=element.f;
let n=0;
// ПРЕДРАСЧЁТ ИНДЕКСОВ ДЛЯ ПЕРВОЙ ИТЕРАЦИИ
let child1N=1;
let child2N=2;


while(true){


// ФУНКЦИЯ open_heap ИСПОЛЬЗУЕТСЯ ДЛЯ ХРАНЕНИЯ НОВОЙ ПОЗИЦИИ ЭЛЕМЕНТА, ЕСЛИ ТАКОВАЯ ИМЕЕТСЯ.
let swap=null;
let child1Score;


// ЕСЛИ ПЕРВЫЙ ДОЧЕРНИЙ ЭЛЕМЕНТ СУЩЕСТВУЕТ (НАХОДИТСЯ ВНУТРИ МАССИВА)
if(child1N<length){
// НАХОДИМ И ОЦЕНИВАЕМ
child1Score=open_heap[child1N].f;
// ЕСЛИ ОЦЕНКА МЕНЬШЕ, ЧЕМ У НАШЕГО ЭЛЕМЕНТА, НАМ НУЖНО ПРОИЗВЕСТИ ЗАМЕНУ
if(child1Score<elemScore){
swap=child1N;
}


}


// ПРОВЕРЯЕМ ДЛЯ ДРУГОГО ДОЧЕРНЕГО ЭЛЕМЕНТА
if(child2N<length){
if(open_heap[child2N].f<(swap===null?elemScore:child1Score)){
swap=child2N;
}
}


// ЕСЛИ ЭЛЕМЕНТ НЕОБХОДИМО ПЕРЕМЕСТИТЬ, МЕНЯЕМ ЕГО МЕСТАМИ
if(swap!==null){
open_heap[n]=open_heap[swap];
n=swap;
child2N=(n+1)<<1;
child1N=child2N-1;
}
// В ПРОТИВНОМ СЛУЧАЕ, НА ЭТОМ ВСЁ
else{ break; }
}


open_heap[n]=element;


}


class astar{


// ____________________ SEARCH ____________________


static search(corridor_result,graph,start,end){


// ЭТА ОЧИСТКА РАБОТАЕТ БЫСТРО ДЛЯ НЕБОЛШОГО КОЛИЧЕСТВА УЗЛОВ, А ЕСЛИ ЧИСТИТЬ ТОЛЬКО ЗАТРОНУТЫЕ УЗЛЫ, ТО ЭТО ЗАМЕДЛИТ СКОРОСТЬ ИЗ-ЗА ПРИМЕНЕНИЯ PUSH И СБОРЩИКА МУСОРА
for(let n=0;n<graph.length;n++){
const node=graph[n];
node.f=0;
node.g=0;
node.h=0;
node.visited=false;
node.closed=false;
node.parent=null;
}


let end_centroid_x=end.centroid.x;
let end_centroid_y=end.centroid.y;
let end_centroid_z=end.centroid.z;


open_heap.length=0;
open_heap[0]=start;


while(open_heap.length>0){


// ПОЛУЧАЕМ НАИМЕНЬШЕЕ ЗНАЧЕНИЕ F(X) ДЛЯ ДАЛЬНЕЙШЕЙ ОБРАБОТКИ. КУЧА СОХРАНЯЕТ ЭТО В ОТСОРТИРОВАННОМ ВИДЕ.
// СОХРАНЯЕМ ПЕРВЫЙ ЭЛЕМЕНТ, ЧТОБЫ ВЕРНУТЬ ЕГО ПОЗЖЕ.
const current_node=open_heap[0];
// Извлекаем последний элемент, заменяем им корень и балансируем кучу вверх
const end_node=open_heap.pop();
// ЕСЛИ ОСТАЛИСЬ ЭЛЕМЕНТЫ, ТО ПОМЕЩАЕМ КОНЕЧНЫЙ ЭЛЕМЕНТ В НАЧАЛО И ПРИМЕНЯЕМ bubble_up
if(open_heap.length>0){
open_heap[0]=end_node;
bubble_up(open_heap);
}


// КОНЕЧНЫЙ УЗЕЛ НАЙДЕН, ВОЗВРАЩАЕМ ПУТЬ ОБЯЗАТЕЛЬНО СО СТАРТОВЫМ УЗЛОМ


if(current_node===end){
	
	
let current=current_node;
// 1. СЧИТАЕМ ТОЧНУЮ ДЛИНУ ПУТИ
let path_length=1;
while(current.parent){
path_length++;
current=current.parent;
}
corridor_result.length=path_length;
current=current_node;
let idx=path_length-1;
while(current){
corridor_result[idx--]=current;
current=current.parent;
}
return true;


}


// ЗАКРЫВАЕМ УЗЕЛ И ОБРАБАТЫВАЕМ ЕГО СОСЕДЕЙ
current_node.closed=true;


let current_node_neighbours=current_node.neighbours;
let current_node_g=current_node.g;


for(let i=0;i<current_node_neighbours.length;i++){


const neighbour=graph[current_node_neighbours[i]];


// НЕДОПУСТИМЫЙ УЗЕЛ ДЛЯ ОБРАБОТКИ, ПЕРЕХОДИМ К СЛЕДУЮЩЕМУ СОСЕДУ
if(neighbour.closed){ continue; }


// ПОКАЗАТЕЛЬ G — ЭТО КРАТЧАЙШЕЕ РАССТОЯНИЕ ОТ НАЧАЛЬНОЙ ТОЧКИ ДО ТЕКУЩЕГО УЗЛА
// НАДО ПРОВЕРИТЬ, ЯВЛЯЕТСЯ ЛИ ПУТЬ, ПО КОТОРОМУ МЫ ПРИШЛИ К ЭТОМУ СОСЕДУ, САМЫМ КРАТЧАЙШИМ ИЗ ВСЕХ, ЧТО МЫ ВИДЕЛИ ДО СИХ ПОР
// +1 ЭТО ЦЕНА ПРОХОДА ПО УМОЛЧАНИЮ, ИНАЧЕ НЕ НАЙДЁТ КОРОТКИЙ ПУТЬ.
const gScore=current_node_g+1;
const beenVisited=neighbour.visited;


if(!beenVisited || gScore<neighbour.g){


// НАЙДЕН ОПТИМАЛЬНЫЙ (ПОКА ЧТО) ПУТЬ К ЭТОМУ УЗЛУ. ОЦЕНИМ ЭТОТ ПУТЬ, ЧТОБЫ ПОНЯТЬ, НАСКОЛЬКО ОН ХОРОШ
neighbour.visited=true;
neighbour.parent=current_node;


// В НАШЕМ СЛУЧАЕ В НИЖНЕМ ВАРИАНТЕ КОД "neighbour.h ||" ЛИШНИЙ, ПОЭТОМУ ОН ЗАКОММЕНТИРОВАН
//neighbour.h=neighbour.h || Math.pow(neighbour_centroid.x-end_centroid_x,2)+Math.pow(neighbour_centroid.y-end_centroid_y,2)+Math.pow(neighbour_centroid.z-end_centroid_z,2);
let neighbour_centroid=neighbour.centroid;
let dx=neighbour_centroid.x-end_centroid_x;
let dy=neighbour_centroid.y-end_centroid_y;
let dz=neighbour_centroid.z-end_centroid_z;
neighbour.g=gScore;
// ОБЯЗАТЕЛЬНО ИСПОЛЬЗУЕМ Math.sqrt ЧТОБЫ НАХОДИЛО КРАТЧАЙШИЙ ПУТЬ
neighbour.f=gScore+Math.sqrt(dx*dx+dy*dy+dz*dz);


if(!beenVisited){
// ПРИ ДОБАВЛЕНИИ В КУЧУ ОБЪЕКТ ОКАЖЕТСЯ В НУЖНОМ МЕСТЕ В СООТВЕТСТВИИ СО ЗНАЧЕНИЕМ "f".
open_heap.push(neighbour);
// БАЛАНСИРУЕМ КУЧУ С НОВЫМ ДОБАВЛЕННЫМ УЗЛОМ, ЧТОБЫ ВЫБРАТЬ ОПТИМАЛЬНЫЙ ПУТЬ ПОСЛЕ ЭТОГО
sink_down(open_heap,open_heap.length-1);
}
else{
// ЭТОТ УЗЕЛ УЖЕ БЫЛ ВИДЕН, НО ПОСКОЛЬКУ ЕГО ОЦЕНКА БЫЛА ИЗМЕНЕНА, НАМ НУЖНО ПЕРЕУПОРЯДОЧИТЬ ЕГО В КУЧЕ.
// ЛИНЕЙНЫЙ ПОИСК С КОНЦА МАССИВА—ЭТО ПИК ПРОИЗВОДИТЕЛЬНОСТИ ДЛЯ БОЛЬШИХ И МАЛЫХ МАССИВОВ, Т.К. В АЛГОРИТМЕ A* ИЗМЕНЕННЫЕ СОСЕДИ ПОЧТИ ВСЕГДА НАХОДЯТСЯ В САМОМ КОНЦЕ МАССИВА КУЧИ
// ВМЕСТО МЕДЛЕЕНОГО indexOf: sink_down(open_heap,open_heap.indexOf(neighbour)); 
let idx=open_heap.length-1;
for(;idx>=0;idx--){
if(open_heap[idx]===neighbour){ break; }
}
sink_down(open_heap,idx);
}


}
}
}


// ПУТЬ НЕ НАЙДЕН
return false;


}
}


export {astar};