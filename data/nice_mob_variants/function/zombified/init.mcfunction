schedule function nice_mob_variants:zombified/init 1s

execute as @e[type=pig,tag=!nice_mob_variants.zombified.done] at @s \
    if dimension minecraft:the_nether run function nice_mob_variants:zombified/exec