schedule function nice_mob_variants:duck/init 5s

execute as @e[type=chicken,tag=!nice_mob_variants.duck] if data entity @s {variant:"nice_mob_variants:duck"} unless data entity @s data.nice_mob_variants.quack_pitch run function nice_mob_variants:duck/tag/init
execute as @e[type=chicken,tag=nice_mob_variants.duck] if data entity @s {variant:"nice_mob_variants:duck"} if data entity @s data.nice_mob_variants.quack_pitch run function nice_mob_variants:duck/play/init with entity @s data.nice_mob_variants