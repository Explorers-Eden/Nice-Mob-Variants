schedule function nice_mob_variants:ender/init 9t

execute as @e[type=#nice_mob_variants:is_data_driven_mob] at @s \
    if data entity @s {variant:"nice_mob_variants:ender"} \
        run function nice_mob_variants:ender/exec