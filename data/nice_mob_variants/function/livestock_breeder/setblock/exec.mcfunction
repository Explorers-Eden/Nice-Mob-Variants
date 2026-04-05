playsound minecraft:block.wood.place block @a ~ ~ ~ 0.8
setblock ~ ~ ~ minecraft:petrified_oak_slab[type=double]

execute align xyz run summon item_display ~.5 ~1.01 ~.5 \
    {\
        billboard:"fixed",\
        Tags:["nice_mob_variants.livestock_breeder.block"],\
        transformation:{\
            left_rotation:[0f,0f,0f,1f],\
            right_rotation:[0f,0f,0f,1f],\
            translation:[0f,-0.51f,0f],\
            scale:[1f,1f,1f]\
        },\
        item:{\
            id:"minecraft:barrier",\
            count:1,\
            components:{\
                "minecraft:item_model":"nice_mob_variants:livestock_breeder"\
            }\
        }\
    }

data modify entity @s Rotation set value [0.0f,0.0f]

kill @s